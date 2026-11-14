//! SoundCloud, through the API its own web player uses (api-v2). SoundCloud hands out no keys any
//! more, so Carbon reads the web app's public client id from its script bundles, as other open
//! clients do, and keeps it in memory. Streaming only: when a song's turn comes Carbon asks for its
//! plain (progressive) address and the webview's audio element plays it. Nothing is saved, and
//! songs offered only as segmented or protected streams are left alone.
use serde_json::Value;
use std::time::{Duration, Instant};
use tauri::State;
use tokio::sync::Mutex;

const NAME: &str = "SoundCloud";
const SITE: &str = "https://soundcloud.com/";
const API: &str = "https://api-v2.soundcloud.com";
const API_HOST: &str = "api-v2.soundcloud.com";
const ASSETS: &str = "https://a-v2.sndcdn.com/assets/";
const TIMEOUT: Duration = Duration::from_secs(15);
/// A client id is not read again sooner than this, however many calls are refused.
const KEEP: Duration = Duration::from_secs(300);
const MAX_RESPONSE: usize = 8 * 1024 * 1024;
const MAX_SCRIPTS: usize = 12;
const MAX_URL: usize = 1024;
const MAX_PARAMS: usize = 8;
const MAX_PARAM: usize = 512;
const MAX_ID: usize = 20;
const CHANGED: &str = "SoundCloud changed something Carbon relies on. Try again later.";

pub struct SoundCloud {
    http: reqwest::Client,
    client_id: Mutex<Option<(String, Instant)>>,
}

impl SoundCloud {
    pub fn new(version: &str) -> Self {
        let http = reqwest::Client::builder().timeout(TIMEOUT).user_agent(format!("Carbon/{version}")).build().unwrap_or_default();
        Self { http, client_id: Mutex::new(None) }
    }

    /// The id in memory, or one read from the web app. `refresh` reads again unless that was just done.
    async fn client_id(&self, refresh: bool) -> Result<String, String> {
        let mut held = self.client_id.lock().await;
        if let Some((id, _)) = held.as_ref().filter(|(_, at)| !refresh || at.elapsed() < KEEP) {
            return Ok(id.clone());
        }
        let id = self.discover().await?;
        *held = Some((id.clone(), Instant::now()));
        Ok(id)
    }

    async fn discover(&self) -> Result<String, String> {
        let page = text(self.http.get(SITE).send().await, NAME).await?;
        for url in script_urls(&page) {
            let script = text(self.http.get(&url).send().await, NAME).await?;
            if let Some(id) = find_client_id(&script) {
                return Ok(id);
            }
        }
        eprintln!("[soundcloud] no client id in the web app's scripts");
        Err(CHANGED.into())
    }

    async fn send(&self, url: &str, params: &[(&str, &str)], client_id: &str) -> Result<reqwest::Response, String> {
        let url = reqwest::Url::parse_with_params(url, params.iter().chain(&[("client_id", client_id)])).map_err(|e| e.to_string())?;
        self.http.get(url).send().await.map_err(|e| offline(e, NAME))
    }

    /// One API call. A refused client id is read again once and the call retried once; never more.
    async fn get(&self, url: &str, params: &[(&str, &str)]) -> Result<Value, String> {
        let id = self.client_id(false).await?;
        let first = self.send(url, params, &id).await?;
        if !matches!(first.status().as_u16(), 401 | 403) {
            return json(first, NAME, MAX_RESPONSE).await;
        }
        let fresh = self.client_id(true).await?;
        let res = if fresh == id { first } else { self.send(url, params, &fresh).await? };
        json(res, NAME, MAX_RESPONSE).await
    }
}

fn offline(e: reqwest::Error, name: &str) -> String {
    eprintln!("[{}] request failed: {}", name.to_lowercase(), e.without_url());
    format!("Can't reach {name}. Check your connection.")
}

fn explain_status(status: u16, name: &str) -> String {
    match status {
        401 | 403 => format!("{name} refused that. It may not be available where you are."),
        404 => format!("{name} doesn't have that any more."),
        429 => format!("{name} is asking Carbon to slow down. Try again in a minute."),
        500.. => format!("{name} is having trouble right now. Try again shortly."),
        _ => format!("{name} answered with an error ({status})."),
    }
}

/// A successful answer's body, refused when it is larger than `max`.
pub(crate) async fn body(res: Result<reqwest::Response, reqwest::Error>, name: &str, max: usize) -> Result<Vec<u8>, String> {
    let res = res.map_err(|e| offline(e, name))?;
    let status = res.status().as_u16();
    if !(200..300).contains(&status) {
        eprintln!("[{}] answered {status}", name.to_lowercase());
        return Err(explain_status(status, name));
    }
    let too_big = || format!("{name} sent more than Carbon expected.");
    if res.content_length().is_some_and(|n| n as usize > max) {
        return Err(too_big());
    }
    let bytes = res.bytes().await.map_err(|e| {
        eprintln!("[{}] body failed: {}", name.to_lowercase(), e.without_url());
        format!("{name} stopped answering. Try again.")
    })?;
    if bytes.len() > max { Err(too_big()) } else { Ok(bytes.to_vec()) }
}

pub(crate) fn parse(bytes: &[u8], name: &str) -> Result<Value, String> {
    serde_json::from_slice(bytes).map_err(|e| {
        eprintln!("[{}] unreadable answer: {e}", name.to_lowercase());
        format!("{name} sent something Carbon can't read.")
    })
}

async fn json(res: reqwest::Response, name: &str, max: usize) -> Result<Value, String> {
    parse(&body(Ok(res), name, max).await?, name)
}

async fn text(res: Result<reqwest::Response, reqwest::Error>, name: &str) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&body(res, name, MAX_RESPONSE).await?).into_owned())
}

/// An https address on one of `hosts` (the name itself or anything under it), or None.
pub(crate) fn https_on(url: &str, hosts: &[&str]) -> Option<String> {
    if url.len() > MAX_URL || !url.starts_with("https://") || url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return None;
    }
    let parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?;
    let plain = parsed.username().is_empty() && parsed.password().is_none() && parsed.port().is_none();
    let known = hosts.iter().any(|h| host == *h || host.strip_suffix(h).is_some_and(|rest| rest.ends_with('.')));
    (plain && known).then(|| url.to_string())
}

/// A service's numeric id, as the webview sends it.
pub(crate) fn check_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty() && id.len() <= MAX_ID && id.bytes().all(|b| b.is_ascii_digit());
    ok.then_some(()).ok_or_else(|| "That isn't an id Carbon knows.".to_string())
}

/// The web app's script addresses, last first: the client id has always sat in one of the last bundles.
fn script_urls(html: &str) -> Vec<String> {
    let name_ok = |url: &str| url[ASSETS.len()..].bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.');
    let mut found: Vec<String> = html
        .split("src=\"")
        .skip(1)
        .filter_map(|rest| rest.split('"').next())
        .filter(|url| url.len() <= MAX_URL && url.starts_with(ASSETS) && url.ends_with(".js") && name_ok(url))
        .map(str::to_string)
        .collect();
    found.reverse();
    found.truncate(MAX_SCRIPTS);
    found
}

fn find_client_id(script: &str) -> Option<String> {
    const MARKER: &str = "client_id:\"";
    script.match_indices(MARKER).find_map(|(at, _)| {
        let id = script[at + MARKER.len()..].split('"').next()?;
        ((20..=40).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric())).then(|| id.to_string())
    })
}

/// The calls Carbon's pages make; anything else from the webview is refused.
fn check_path(path: &str) -> Result<(), String> {
    let is_id = |id: &str| check_id(id).is_ok();
    let parts: Vec<&str> = path.split('/').collect();
    let ok = match parts.as_slice() {
        ["search", kind] => ["tracks", "playlists", "users"].contains(kind),
        ["tracks"] | ["charts"] | ["mixed-selections"] => true,
        ["playlists", id] | ["users", id] => is_id(id),
        ["users", id, list] => is_id(id) && ["tracks", "playlists"].contains(list),
        _ => false,
    };
    ok.then_some(()).ok_or_else(|| "That isn't something Carbon asks SoundCloud for.".to_string())
}

fn check_params(params: &[(String, String)]) -> Result<(), String> {
    let key_ok = |k: &str| !k.is_empty() && k.len() <= 32 && k != "client_id" && k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_');
    let value_ok = |v: &str| v.len() <= MAX_PARAM && !v.chars().any(char::is_control);
    let ok = params.len() <= MAX_PARAMS && params.iter().all(|(k, v)| key_ok(k) && value_ok(v));
    ok.then_some(()).ok_or_else(|| "That search is too long for SoundCloud.".to_string())
}

/// Hosts SoundCloud hands signed stream addresses out on.
const STREAM_HOSTS: [&str; 2] = ["sndcdn.com", "soundcloud.cloud"];

/// Where a song's stream of one kind is handed out: full-length and unprotected, or None.
/// `protocol` is "progressive" (one file) or "hls" (segments; never the encrypted variants, which
/// Carbon leaves alone). Segmented streams must be MP3 or AAC, which the webview's HLS player reads.
fn transcoding(track: &Value, protocol: &str) -> Option<String> {
    if matches!(track["policy"].as_str(), Some("SNIP" | "BLOCK")) {
        return None;
    }
    track["media"]["transcodings"].as_array()?.iter().find_map(|t| {
        let mime = t["format"]["mime_type"].as_str().unwrap_or_default();
        let readable = protocol == "progressive" || mime.contains("mpeg") || mime.contains("mp4");
        let plain = t["format"]["protocol"] == protocol && t["snipped"] != true && readable;
        let url = https_on(t["url"].as_str()?, &[API_HOST])?;
        (plain && url.starts_with(&format!("{API}/media/")) && !url.contains(['?', '#'])).then_some(url)
    })
}

fn progressive(track: &Value) -> Option<String> {
    transcoding(track, "progressive")
}

/// The stream to play: the one-file kind when SoundCloud offers it, else unencrypted segments.
fn playable(track: &Value) -> Option<String> {
    progressive(track).or_else(|| transcoding(track, "hls"))
}

/// One read of SoundCloud's catalogue: a search, a playlist, a person, a chart.
#[tauri::command]
pub async fn soundcloud_get(soundcloud: State<'_, SoundCloud>, path: String, params: Vec<(String, String)>) -> Result<Value, String> {
    check_path(&path)?;
    check_params(&params)?;
    let pairs: Vec<(&str, &str)> = params.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    soundcloud.get(&format!("{API}/{path}"), &pairs).await
}

/// The address the audio element plays a song from, signed by SoundCloud for this one play.
#[tauri::command]
pub async fn soundcloud_stream(soundcloud: State<'_, SoundCloud>, id: String) -> Result<String, String> {
    check_id(&id)?;
    let track = soundcloud.get(&format!("{API}/tracks/{id}"), &[]).await?;
    let media = playable(&track).ok_or("SoundCloud doesn't offer that song in a form Carbon can play.")?;
    let authorization = track["track_authorization"].as_str().unwrap_or_default();
    let signed = soundcloud.get(&media, &[("track_authorization", authorization)]).await?;
    https_on(signed["url"].as_str().unwrap_or_default(), &STREAM_HOSTS).ok_or_else(|| {
        eprintln!("[soundcloud] track {id}: no usable stream address in the answer");
        CHANGED.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn finds_the_web_apps_scripts_last_first() {
        let html = r#"<script crossorigin src="https://a-v2.sndcdn.com/assets/59-ac0a49ce.js"></script>
            <script src="https://evil.example/assets/1.js"></script><img src="https://a-v2.sndcdn.com/assets/logo.png">
            <script src="https://a-v2.sndcdn.com/assets/../x.js?y"></script>
            <script src="https://a-v2.sndcdn.com/assets/55-a70a06aa.js" crossorigin></script>"#;
        assert_eq!(script_urls(html), ["https://a-v2.sndcdn.com/assets/55-a70a06aa.js", "https://a-v2.sndcdn.com/assets/59-ac0a49ce.js"]);
        let many: String = (0..40).map(|i| format!(r#"<script src="{ASSETS}{i}.js">"#)).collect();
        assert_eq!(script_urls(&many).len(), MAX_SCRIPTS);
        assert!(script_urls("<html></html>").is_empty());
    }

    #[test]
    fn reads_the_client_id_from_a_bundle() {
        let script = r#"x({client_id:"short"}),e.exports={client_id:"abcDEF0123456789abcDEF0123456789",env:"production"}"#;
        assert_eq!(find_client_id(script).as_deref(), Some("abcDEF0123456789abcDEF0123456789"));
        assert_eq!(find_client_id(r#"client_id:"abcDEF0123456789abc&client_id=x"#), None);
        assert_eq!(find_client_id("nothing here"), None);
    }

    #[test]
    fn only_makes_the_calls_carbon_knows() {
        for ok in ["search/tracks", "search/users", "tracks", "charts", "mixed-selections", "playlists/123", "users/9", "users/9/tracks", "users/9/playlists"] {
            assert!(check_path(ok).is_ok(), "{ok}");
        }
        for bad in ["", "me", "search", "search/../me", "users/9/likes", "playlists/abc", "tracks/1/download", "playlists/1?x", "users//tracks", "https://example.com"] {
            assert!(check_path(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn checks_ids_and_params() {
        assert!(check_id("234194052").is_ok());
        for bad in ["", "12a", "-1", "1/2", "123456789012345678901"] {
            assert!(check_id(bad).is_err(), "{bad}");
        }
        let pair = |k: &str, v: &str| (k.to_string(), v.to_string());
        assert!(check_params(&[pair("q", "night drive & more"), pair("limit", "20")]).is_ok());
        assert!(check_params(&[pair("client_id", "mine")]).is_err());
        assert!(check_params(&[pair("q&x", "1")]).is_err());
        assert!(check_params(&[pair("q", &"a".repeat(MAX_PARAM + 1))]).is_err());
        assert!(check_params(&vec![pair("q", "1"); MAX_PARAMS + 1]).is_err());
    }

    #[test]
    fn trusts_only_https_addresses_on_known_hosts() {
        assert!(https_on("https://cf-media.sndcdn.com/a.128.mp3?Policy=x", &["sndcdn.com"]).is_some());
        assert!(https_on("https://sndcdn.com/a.mp3", &["sndcdn.com"]).is_some());
        for bad in ["http://cf-media.sndcdn.com/a.mp3", "https://evilsndcdn.com/a.mp3", "https://sndcdn.com.evil.example/a", "https://user@cf-media.sndcdn.com/a", "https://cf-media.sndcdn.com:8443/a", "https://cf-media.sndcdn.com/a b", "file:///c:/a.mp3", ""] {
            assert_eq!(https_on(bad, &["sndcdn.com"]), None, "{bad}");
        }
    }

    #[test]
    fn picks_only_a_plain_full_length_stream() {
        let transcoding = |protocol: &str, snipped: bool, url: &str| json!({ "url": url, "snipped": snipped, "format": { "protocol": protocol } });
        let media = "https://api-v2.soundcloud.com/media/soundcloud:tracks:1/abc/stream";
        let track = |policy: &str, list: Vec<Value>| json!({ "policy": policy, "media": { "transcodings": list } });
        let both = vec![transcoding("hls", false, &format!("{media}/hls")), transcoding("progressive", false, &format!("{media}/progressive"))];
        assert_eq!(progressive(&track("MONETIZE", both.clone())), Some(format!("{media}/progressive")));
        assert_eq!(progressive(&track("SNIP", both.clone())), None);
        assert_eq!(progressive(&track("BLOCK", both)), None);
        assert_eq!(progressive(&track("ALLOW", vec![transcoding("hls", false, &format!("{media}/hls"))])), None);
        assert_eq!(progressive(&track("ALLOW", vec![transcoding("ctr-encrypted-hls", false, &format!("{media}/hls"))])), None);
        assert_eq!(progressive(&track("ALLOW", vec![transcoding("progressive", true, &format!("{media}/progressive"))])), None);
        assert_eq!(progressive(&track("ALLOW", vec![transcoding("progressive", false, "https://example.com/media/x")])), None);
        assert_eq!(progressive(&track("ALLOW", vec![transcoding("progressive", false, "https://api-v2.soundcloud.com/me?x=1")])), None);
        assert_eq!(progressive(&json!({ "id": 1 })), None);
        let segments = |protocol: &str, mime: &str| json!({ "url": format!("{media}/hls"), "snipped": false, "format": { "protocol": protocol, "mime_type": mime } });
        assert_eq!(playable(&track("ALLOW", vec![segments("hls", "audio/mpeg")])), Some(format!("{media}/hls")));
        assert_eq!(playable(&track("ALLOW", vec![segments("hls", "audio/mp4; codecs=\"mp4a.40.2\"")])), Some(format!("{media}/hls")));
        assert_eq!(playable(&track("ALLOW", vec![segments("hls", "audio/ogg; codecs=\"opus\"")])), None, "the webview's HLS player can't read Opus segments");
        assert_eq!(playable(&track("ALLOW", vec![segments("ctr-encrypted-hls", "audio/mp4")])), None, "encrypted streams are left alone");
        assert_eq!(playable(&track("SNIP", vec![segments("hls", "audio/mpeg")])), None);
    }

    /// Talks to SoundCloud itself, for when it changes: `cargo test --lib soundcloud -- --ignored`.
    #[tokio::test]
    #[ignore = "needs the internet"]
    async fn live_reads_a_client_id_searches_and_signs_a_stream() {
        let soundcloud = SoundCloud::new("test");
        let found = soundcloud.get(&format!("{API}/search/tracks"), &[("q", "piano 2015"), ("limit", "50")]).await.unwrap();
        let tracks = found["collection"].as_array().unwrap();
        assert!(!tracks.is_empty());
        let media = tracks.iter().find_map(progressive).expect("no song with a plain stream in fifty results");
        let signed = soundcloud.get(&media, &[]).await.unwrap();
        assert!(https_on(signed["url"].as_str().unwrap(), &STREAM_HOSTS).is_some());
        let segmented = tracks.iter().filter(|t| progressive(t).is_none()).filter(|t| playable(t).is_some()).count();
        let total = tracks.len();
        let both = tracks.iter().filter(|t| playable(t).is_some()).count();
        eprintln!("playable {both} of {total}, {segmented} of them only as segments");
        let hls = tracks.iter().filter(|t| progressive(t).is_none()).find_map(playable).expect("no segmented-only song in fifty results");
        let signed = soundcloud.get(&hls, &[]).await.unwrap();
        let address = signed["url"].as_str().unwrap();
        let listed = reqwest::Url::parse(address).unwrap();
        eprintln!("segments are listed at host {:?}", listed.host_str());
        assert!(listed.path().ends_with(".m3u8"), "the webview tells a segmented stream by this ending: {}", listed.path());
        assert!(https_on(address, &STREAM_HOSTS).is_some());
        let list = soundcloud.http.get(address).send().await.unwrap().text().await.unwrap();
        let first = list.lines().find(|l| l.starts_with("https://")).unwrap_or_default();
        eprintln!("first segment host {:?}; list starts {:?}", reqwest::Url::parse(first).ok().and_then(|u| u.host_str().map(str::to_string)), &list[..list.len().min(120)]);
    }

    #[test]
    fn explains_refusals_in_plain_sentences() {
        assert!(explain_status(404, NAME).contains("doesn't have that"));
        assert!(explain_status(429, NAME).contains("slow down"));
        assert!(explain_status(503, NAME).contains("trouble"));
        assert!(parse(b"<html>", NAME).is_err());
    }
}
