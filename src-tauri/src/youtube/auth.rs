//! YouTube Music sign-in secrets: the session cookies captured from the sign-in window. They live
//! only in Windows Credential Manager and in memory; the webview never sees them. One credential
//! holds at most 2560 bytes and a signed-in cookie set is larger, so they're stored in chunks.
use keyring::Entry;
use sha1::{Digest, Sha1};

const SERVICE: &str = "com.pealz.carbon";
const ACCOUNT_PREFIX: &str = "youtube-music-cookies-";
/// Bytes per credential, under Windows' CRED_MAX_CREDENTIAL_BLOB_SIZE (2560).
const CHUNK: usize = 2048;
const MAX_CHUNKS: usize = 8;
pub const MAX_HEADER: usize = CHUNK * MAX_CHUNKS;
pub const ORIGIN: &str = "https://music.youtube.com";
/// Cookies YouTube's web client derives its Authorization header from, in order of preference.
const HASH_COOKIES: [&str; 2] = ["SAPISID", "__Secure-3PAPISID"];

fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 256 && name.bytes().all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+.^_`|~-".contains(&b))
}

fn valid_value(value: &str) -> bool {
    value.len() <= 4096 && value.bytes().all(|b| b.is_ascii_graphic() && b != b';' && b != b',' && b != b'"' && b != b'\\')
}

/// Joins cookies into a request header ("a=1; b=2"), skipping malformed ones.
pub fn cookie_header<'a>(pairs: impl IntoIterator<Item = (&'a str, &'a str)>) -> Result<String, String> {
    let header = pairs
        .into_iter()
        .filter(|(name, value)| valid_name(name) && valid_value(value))
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ");
    if header.len() > MAX_HEADER {
        return Err("YouTube's sign-in cookies are larger than Carbon can store.".into());
    }
    Ok(header)
}

fn find<'a>(header: &'a str, name: &str) -> Option<&'a str> {
    header.split("; ").find_map(|pair| pair.strip_prefix(name)?.strip_prefix('=')).filter(|v| !v.is_empty())
}

/// Whether the header holds a signed-in session (it can sign requests).
pub fn is_signed_in(header: &str) -> bool {
    HASH_COOKIES.iter().any(|name| find(header, name).is_some())
}

/// The web client's `Authorization: SAPISIDHASH <ts>_<sha1("<ts> <SAPISID> <origin>")>` value.
pub fn sapisid_hash(header: &str, unix_secs: u64) -> Option<String> {
    let sapisid = HASH_COOKIES.iter().find_map(|name| find(header, name))?;
    let digest = Sha1::digest(format!("{unix_secs} {sapisid} {ORIGIN}").as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    Some(format!("SAPISIDHASH {unix_secs}_{hex}"))
}

/// Splits a header into credential-sized chunks. Headers are ASCII, so byte splits are safe.
fn split(header: &str) -> Vec<&[u8]> {
    header.as_bytes().chunks(CHUNK).collect()
}

fn join(chunks: Vec<Vec<u8>>) -> Result<Option<String>, String> {
    let bytes = chunks.concat();
    if bytes.is_empty() {
        return Ok(None);
    }
    String::from_utf8(bytes).map(Some).map_err(|_| "saved YouTube Music sign-in is corrupt".into())
}

fn entry(index: usize) -> Result<Entry, String> {
    Entry::new(SERVICE, &format!("{ACCOUNT_PREFIX}{index}")).map_err(|e| format!("credential store unavailable: {e}"))
}

pub fn save(header: &str) -> Result<(), String> {
    if !is_signed_in(header) || header.len() > MAX_HEADER {
        return Err("refusing to save an incomplete YouTube Music sign-in".into());
    }
    clear()?;
    for (index, chunk) in split(header).into_iter().enumerate() {
        entry(index)?.set_secret(chunk).map_err(|e| format!("could not save YouTube Music sign-in: {e}"))?;
    }
    Ok(())
}

pub fn load() -> Result<Option<String>, String> {
    let mut chunks = Vec::new();
    for index in 0..MAX_CHUNKS {
        match entry(index)?.get_secret() {
            Ok(chunk) => chunks.push(chunk),
            Err(keyring::Error::NoEntry) => break,
            Err(e) => return Err(format!("could not read saved YouTube Music sign-in: {e}")),
        }
    }
    join(chunks)
}

pub fn clear() -> Result<(), String> {
    for index in 0..MAX_CHUNKS {
        match entry(index)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(format!("could not remove saved YouTube Music sign-in: {e}")),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER: &str = "YSC=abc; SAPISID=AbC-dEf/ghi_JKL; __Secure-3PAPISID=other";

    #[test]
    fn builds_headers_from_well_formed_cookies_only() {
        let pairs = [("SID", "s1"), ("bad name", "x"), ("HSID", "a;b"), ("APISID", "ok/1")];
        assert_eq!(cookie_header(pairs).unwrap(), "SID=s1; APISID=ok/1");
        let huge = "x".repeat(4000);
        let many: Vec<(String, String)> = (0..5).map(|i| (format!("c{i}"), huge.clone())).collect();
        assert!(cookie_header(many.iter().map(|(n, v)| (n.as_str(), v.as_str()))).is_err());
    }

    #[test]
    fn computes_the_sapisid_hash() {
        assert_eq!(
            sapisid_hash(HEADER, 1_700_000_000).as_deref(),
            Some("SAPISIDHASH 1700000000_56b6299ec1c880ea6986dab3201411fcd252603b")
        );
        // Falls back to the third-party copy when SAPISID itself is missing.
        assert!(sapisid_hash("__Secure-3PAPISID=x", 1).is_some());
        assert_eq!(sapisid_hash("YSC=abc; SAPISIDX=1", 1), None);
        assert!(!is_signed_in("YSC=abc; VISITOR_INFO1_LIVE=x"));
        assert!(is_signed_in(HEADER));
    }

    #[test]
    fn chunks_round_trip() {
        let header = format!("SAPISID=x; LONG={}", "y".repeat(CHUNK * 2 + 17));
        let chunks: Vec<Vec<u8>> = split(&header).into_iter().map(<[u8]>::to_vec).collect();
        assert_eq!(chunks.len(), 3);
        assert!(chunks.iter().all(|c| c.len() <= CHUNK));
        assert_eq!(join(chunks).unwrap().as_deref(), Some(header.as_str()));
        assert_eq!(join(vec![]).unwrap(), None);
        assert!(join(vec![vec![0xff, 0xfe]]).is_err());
    }
}
