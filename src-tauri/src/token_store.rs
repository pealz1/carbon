//! Keeps sign-in secrets in Windows Credential Manager, never on disk in plain text: the
//! Spotify refresh token and the Carbon account's app session token.
use keyring::Entry;
use sha2::{Digest, Sha256};

const SERVICE: &str = "com.pealz.carbon";
const SPOTIFY: &str = "spotify-refresh-token";
const CARBON: &str = "carbon-session";
const MAX_TOKEN_LEN: usize = 4096;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct CarbonApi(String);

impl CarbonApi {
    pub(crate) fn parse(value: &str) -> Result<Self, String> {
        let url = reqwest::Url::parse(value).map_err(|_| "Invalid Carbon accounts API URL.")?;
        let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        let secure = url.scheme() == "https" || (url.scheme() == "http" && loopback);
        if !url.has_host() || !secure || !url.username().is_empty() || url.password().is_some()
            || url.query().is_some() || url.fragment().is_some() {
            return Err("The Carbon accounts API needs HTTPS or a local development server.".into());
        }
        Ok(Self(url.as_str().trim_end_matches('/').to_owned()))
    }

    pub(crate) fn url(&self) -> &str { &self.0 }

    pub(crate) fn credential_name(&self, name: &str) -> String {
        // Legacy entries have no issuer. A fresh sign-in is the only safe way to bind them.
        format!("{name}-{:x}", Sha256::digest(self.url().as_bytes()))
    }

    pub(crate) fn token(&self) -> Result<Option<String>, String> { load(&self.credential_name(CARBON)) }

    pub(crate) fn clear_token(&self) -> Result<(), String> {
        clear(&self.credential_name(CARBON))?;
        clear(CARBON)
    }
}

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|e| format!("credential store unavailable: {e}"))
}

/// Tokens are opaque single-line strings; anything else is a bug or an attack.
fn check(token: &str) -> Result<(), String> {
    if token.trim().is_empty() {
        return Err("refusing to save an empty token".into());
    }
    if token.len() > MAX_TOKEN_LEN || token.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("refusing to save a malformed token".into());
    }
    Ok(())
}

pub(crate) fn load(account: &str) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read saved sign-in: {e}")),
    }
}

pub(crate) fn save(account: &str, token: &str) -> Result<(), String> {
    check(token)?;
    entry(account)?
        .set_password(token)
        .map_err(|e| format!("could not save sign-in: {e}"))
}

pub(crate) fn clear(account: &str) -> Result<(), String> {
    match entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not remove saved sign-in: {e}")),
    }
}

#[tauri::command]
pub fn token_load() -> Result<Option<String>, String> {
    load(SPOTIFY)
}

#[tauri::command]
pub fn token_save(token: String) -> Result<(), String> {
    save(SPOTIFY, &token)
}

#[tauri::command]
pub fn token_clear() -> Result<(), String> {
    clear(SPOTIFY)
}

#[tauri::command]
pub fn carbon_token_load(api_url: String, lastfm: tauri::State<'_, crate::lastfm::Lastfm>) -> Result<Option<String>, String> {
    let api = CarbonApi::parse(&api_url)?;
    let token = api.token();
    lastfm.send(crate::lastfm::Msg::AccountApi(api));
    token
}

#[tauri::command]
pub fn carbon_token_save(api_url: String, token: String) -> Result<(), String> {
    save(&CarbonApi::parse(&api_url)?.credential_name(CARBON), &token)
}

#[tauri::command]
pub fn carbon_token_clear(api_url: String) -> Result<(), String> {
    CarbonApi::parse(&api_url)?.clear_token()
}

#[cfg(test)]
mod tests {
    use super::{check, CarbonApi, CARBON};

    #[test]
    fn carbon_credentials_follow_the_account_server() {
        let official = CarbonApi::parse("https://API.getcarbon.cc:443/").unwrap();
        let local = CarbonApi::parse("http://localhost:8787/").unwrap();
        assert_eq!(official.url(), "https://api.getcarbon.cc");
        assert_ne!(official.credential_name(CARBON), CARBON);
        assert_ne!(local.credential_name(CARBON), official.credential_name(CARBON));
        assert_eq!(local, CarbonApi::parse("http://localhost:8787").unwrap());
        assert_ne!(local.credential_name(CARBON), CarbonApi::parse("http://localhost:8788").unwrap().credential_name(CARBON));
        for bad in ["http://api.getcarbon.cc", "https://user@example.org", "https://example.org/?a=b", "file:///tmp/api"] {
            assert!(CarbonApi::parse(bad).is_err());
        }
    }

    #[test]
    fn accepts_opaque_tokens() {
        assert!(check("AQDx-abc_123.def").is_ok());
    }

    #[test]
    fn rejects_empty_or_malformed_tokens() {
        assert!(check("").is_err());
        assert!(check("   ").is_err());
        assert!(check("two words").is_err());
        assert!(check("line\nbreak").is_err());
        assert!(check(&"x".repeat(5000)).is_err());
    }
}
