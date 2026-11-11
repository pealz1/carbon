//! Sends InnerTube requests as YouTube Music's web client (WEB_REMIX), signed with the saved
//! session when there is one. Responses lose tracking noise before they reach the webview.
use super::auth;
use super::request::{self, Call};
use serde_json::{Value, json};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const API: &str = "https://music.youtube.com/youtubei/v1/";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const TIMEOUT: Duration = Duration::from_secs(20);
const MAX_RESPONSE: usize = 16 * 1024 * 1024;
/// Keys that only carry tracking or screen-reader copies; they make up much of every response.
const NOISE: [&str; 6] = ["trackingParams", "clickTrackingParams", "loggingContext", "accessibility", "accessibilityData", "responseContext"];

pub struct Youtube {
    http: reqwest::Client,
    /// None until first read from Credential Manager; then the saved cookie header, if any.
    cookies: Mutex<Option<Option<String>>>,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn with_context(mut body: Value, unix_secs: u64) -> Value {
    // English labels ("Song", "Album", "views") are what the webview's parsers read.
    body["context"] = json!({
        "client": { "clientName": "WEB_REMIX", "clientVersion": request::client_version(unix_secs), "hl": "en" },
        "user": {},
    });
    body
}

pub fn strip_noise(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for key in NOISE {
                map.remove(key);
            }
            map.values_mut().for_each(strip_noise);
        }
        Value::Array(items) => items.iter_mut().for_each(strip_noise),
        _ => {}
    }
}

fn explain_status(status: u16, signed_in: bool) -> String {
    match status {
        401 | 403 if signed_in => "YouTube Music signed Carbon out. Sign in again from Settings.".into(),
        401 | 403 => "Sign in to YouTube Music for this (Settings, YouTube Music).".into(),
        404 => "YouTube Music couldn't find this.".into(),
        429 => "YouTube Music is limiting requests. Give it a minute.".into(),
        500.. => "YouTube Music is having trouble right now. Try again shortly.".into(),
        _ => format!("YouTube Music refused that request ({status})."),
    }
}

impl Youtube {
    pub fn new() -> Self {
        let http = reqwest::Client::builder().timeout(TIMEOUT).user_agent(USER_AGENT).build().unwrap_or_default();
        Self { http, cookies: Mutex::new(None) }
    }

    pub fn cookies(&self) -> Result<Option<String>, String> {
        let mut cached = self.cookies.lock().map_err(|_| "YouTube Music state is unavailable")?;
        if cached.is_none() {
            *cached = Some(auth::load()?);
        }
        Ok(cached.clone().flatten())
    }

    pub fn set_cookies(&self, header: Option<String>) {
        if let Ok(mut cached) = self.cookies.lock() {
            *cached = Some(header);
        }
    }

    /// The raw response body. Never logs cookies or the Authorization header.
    pub async fn fetch(&self, call: Call) -> Result<Vec<u8>, String> {
        let cookies = self.cookies()?;
        let now = now();
        let mut req = self
            .http
            .post(format!("{API}{}?alt=json&prettyPrint=false", call.endpoint))
            .header("Origin", auth::ORIGIN)
            .header("X-Origin", auth::ORIGIN)
            .json(&with_context(call.body, now));
        if let Some(cookies) = &cookies {
            req = req.header("Cookie", cookies).header("X-Goog-AuthUser", "0");
            if let Some(authorization) = auth::sapisid_hash(cookies, now) {
                req = req.header("Authorization", authorization);
            }
        }
        let res = req.send().await.map_err(|e| {
            eprintln!("[youtube] {} failed: {}", call.endpoint, e.without_url());
            "Can't reach YouTube Music. Check your connection.".to_string()
        })?;
        let status = res.status().as_u16();
        if res.content_length().is_some_and(|n| n as usize > MAX_RESPONSE) {
            return Err("YouTube Music sent more than Carbon expected.".into());
        }
        let bytes = res.bytes().await.map_err(|e| {
            eprintln!("[youtube] {} body failed: {}", call.endpoint, e.without_url());
            "YouTube Music stopped answering. Try again.".to_string()
        })?;
        if !(200..300).contains(&status) {
            eprintln!("[youtube] {} answered {status}", call.endpoint);
            return Err(explain_status(status, cookies.is_some()));
        }
        if bytes.len() > MAX_RESPONSE {
            return Err("YouTube Music sent more than Carbon expected.".into());
        }
        Ok(bytes.to_vec())
    }

    pub async fn send(&self, call: Call) -> Result<Value, String> {
        let bytes = self.fetch(call).await?;
        let mut value: Value = serde_json::from_slice(&bytes).map_err(|_| "YouTube Music sent something Carbon can't read.".to_string())?;
        strip_noise(&mut value);
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_tracking_noise_everywhere() {
        let mut v = json!({
            "responseContext": { "visitorData": "x" },
            "contents": [{ "a": { "trackingParams": "t", "title": "Song", "nested": { "clickTrackingParams": "c", "loggingContext": {} } } }],
        });
        strip_noise(&mut v);
        assert_eq!(v, json!({ "contents": [{ "a": { "title": "Song", "nested": {} } }] }));
    }

    #[test]
    fn adds_the_web_remix_context() {
        let body = with_context(json!({ "query": "q" }), 0);
        assert_eq!(body["context"]["client"]["clientName"], "WEB_REMIX");
        assert_eq!(body["context"]["client"]["clientVersion"], "1.19700101.01.00");
        assert_eq!(body["query"], "q");
    }

    /// Talks to the real service: `cargo test live_ -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn live_search_and_playability() {
        let yt = Youtube::new();
        let found = yt.send(request::search("radiohead", Some(request::SearchFilter::Songs)).unwrap()).await.unwrap();
        assert!(found.to_string().contains("musicShelfRenderer"));
        assert!(!found.to_string().contains("trackingParams"));
        let bytes = yt.fetch(request::playability("7374CZQoS2Y").unwrap()).await.unwrap();
        assert!(String::from_utf8_lossy(&bytes).contains("playabilityStatus"));
    }

    #[test]
    fn explains_statuses_plainly() {
        assert!(explain_status(401, true).contains("Sign in again"));
        assert!(explain_status(403, false).starts_with("Sign in"));
        assert!(explain_status(503, false).contains("trouble"));
        assert!(explain_status(400, false).contains("400"));
    }
}
