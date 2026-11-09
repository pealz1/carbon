//! Last.fm: desktop sign-in, "now playing" and scrobbling. Requests are signed in Rust so the
//! shared secret never reaches the webview. Scrobble rules follow Last.fm's guidelines.
use crate::playback::PlaybackInfo;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::VecDeque;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

pub const API_KEY: Option<&str> = option_env!("CARBON_LASTFM_API_KEY");
pub const SECRET: Option<&str> = option_env!("CARBON_LASTFM_SECRET");
const API_URL: &str = "https://ws.audioscrobbler.com/2.0/";
const AUTH_URL: &str = "https://www.last.fm/api/auth/";
const KEYRING_SERVICE: &str = "com.pealz.carbon";
const KEYRING_ACCOUNT: &str = "lastfm-session";
const MIN_TRACK_MS: u64 = 30_000;
const MAX_REQUIRED_MS: u64 = 240_000;
const TICK: Duration = Duration::from_secs(10);
const AUTH_POLL: Duration = Duration::from_secs(3);
const AUTH_TIMEOUT: Duration = Duration::from_secs(180);
const MAX_PENDING: usize = 50;
const ERR_UNAUTHORIZED_TOKEN: i64 = 14;
const ERR_INVALID_SESSION: i64 = 9;

pub fn configured() -> bool {
    API_KEY.is_some() && SECRET.is_some()
}

// ---------- signing ----------

/// Last.fm signature input: params sorted by name, concatenated, secret appended.
pub fn signature_base(params: &[(&str, String)], secret: &str) -> String {
    let mut sorted: Vec<_> = params.iter().filter(|(k, _)| *k != "format" && *k != "callback").collect();
    sorted.sort_by(|a, b| a.0.cmp(b.0));
    let mut base: String = sorted.iter().map(|(k, v)| format!("{k}{v}")).collect();
    base.push_str(secret);
    base
}

pub fn sign(params: &[(&str, String)], secret: &str) -> String {
    format!("{:x}", md5::compute(signature_base(params, secret)))
}

// ---------- scrobble rules (pure) ----------

#[derive(Debug, PartialEq)]
pub enum Action {
    NowPlaying(PlaybackInfo),
    Scrobble(PlaybackInfo, i64),
}

pub fn eligible(duration_ms: u64, played_ms: u64) -> bool {
    duration_ms > MIN_TRACK_MS && played_ms >= (duration_ms / 2).min(MAX_REQUIRED_MS)
}

struct Tracked {
    info: PlaybackInfo,
    started_unix: i64,
    played_ms: u64,
    playing_since_ms: Option<u64>,
    now_playing_sent: bool,
    scrobbled: bool,
}

/// Counts real (unpaused) listening time per track and decides when to scrobble.
#[derive(Default)]
pub struct Scrobbler {
    current: Option<Tracked>,
}

impl Scrobbler {
    pub fn tick(&mut self, now_ms: u64) -> Vec<Action> {
        let Some(cur) = self.current.as_mut() else { return vec![] };
        if let Some(since) = cur.playing_since_ms {
            cur.played_ms = (cur.played_ms + now_ms.saturating_sub(since)).min(cur.info.duration_ms);
            cur.playing_since_ms = Some(now_ms);
        }
        if !cur.scrobbled && eligible(cur.info.duration_ms, cur.played_ms) {
            cur.scrobbled = true;
            return vec![Action::Scrobble(cur.info.clone(), cur.started_unix)];
        }
        vec![]
    }

    pub fn update(&mut self, info: Option<PlaybackInfo>, now_ms: u64, now_unix: i64) -> Vec<Action> {
        let mut actions = self.tick(now_ms);
        let Some(info) = info else {
            self.current = None;
            return actions;
        };
        let same_track = self.current.as_ref().is_some_and(|c| c.info.track_id == info.track_id);
        if same_track {
            let cur = self.current.as_mut().expect("checked above");
            cur.playing_since_ms = (!info.paused).then_some(now_ms);
            if !info.paused && !cur.now_playing_sent {
                cur.now_playing_sent = true;
                actions.push(Action::NowPlaying(info.clone()));
            }
            cur.info = info;
            return actions;
        }
        if !info.paused {
            actions.push(Action::NowPlaying(info.clone()));
        }
        self.current = Some(Tracked {
            started_unix: now_unix - (info.position_ms / 1000) as i64,
            played_ms: 0,
            playing_since_ms: (!info.paused).then_some(now_ms),
            now_playing_sent: !info.paused,
            scrobbled: false,
            info,
        });
        actions
    }
}

// ---------- session storage ----------

#[derive(Serialize, Deserialize, Clone)]
struct Session {
    name: String,
    key: String,
}

fn keyring() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())
}

fn load_session() -> Option<Session> {
    let text = keyring().ok()?.get_password().ok()?;
    serde_json::from_str(&text).ok()
}

pub fn clear_session() -> Result<(), String> {
    match keyring()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not remove Last.fm sign-in: {e}")),
    }
}

// ---------- API ----------

#[derive(Debug)]
enum ApiError {
    Lastfm(i64, String),
    Network(String),
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Lastfm(code, message) => write!(f, "Last.fm error {code}: {message}"),
            Self::Network(message) => write!(f, "couldn't reach Last.fm: {message}"),
        }
    }
}

async fn call(client: &reqwest::Client, method: &str, mut params: Vec<(&'static str, String)>, session: Option<&str>) -> Result<Value, ApiError> {
    let (Some(key), Some(secret)) = (API_KEY, SECRET) else {
        return Err(ApiError::Lastfm(0, "Last.fm isn't configured in this build".into()));
    };
    params.push(("method", method.to_string()));
    params.push(("api_key", key.to_string()));
    if let Some(sk) = session {
        params.push(("sk", sk.to_string()));
    }
    params.push(("api_sig", sign(&params, secret)));
    params.push(("format", "json".into()));
    let response = client.post(API_URL).form(&params).send().await.map_err(|e| ApiError::Network(e.to_string()))?;
    let body: Value = response.json().await.map_err(|e| ApiError::Network(e.to_string()))?;
    if let Some(code) = body.get("error").and_then(Value::as_i64) {
        let message = body.get("message").and_then(Value::as_str).unwrap_or("Last.fm error").to_string();
        return Err(ApiError::Lastfm(code, message));
    }
    Ok(body)
}

fn track_params(info: &PlaybackInfo) -> Vec<(&'static str, String)> {
    vec![
        ("artist", info.artists.first().cloned().unwrap_or_default()),
        ("track", info.title.clone()),
        ("album", info.album.clone()),
        ("duration", (info.duration_ms / 1000).to_string()),
    ]
}

// ---------- worker ----------

pub enum Msg {
    Playback(Option<PlaybackInfo>),
    Enabled(bool),
    SessionChanged,
}

pub struct Lastfm(UnboundedSender<Msg>);

impl Lastfm {
    pub fn spawn(enabled: bool) -> Self {
        let (tx, rx) = unbounded_channel();
        if configured() {
            tauri::async_runtime::spawn(run(rx, enabled));
        }
        Self(tx)
    }

    pub fn send(&self, msg: Msg) {
        let _ = self.0.send(msg); // no worker when unconfigured
    }
}

fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

async fn run(mut rx: UnboundedReceiver<Msg>, mut enabled: bool) {
    let client = reqwest::Client::new();
    let clock = Instant::now();
    let now_ms = || clock.elapsed().as_millis() as u64;
    let mut session = load_session();
    let mut scrobbler = Scrobbler::default();
    let mut pending: VecDeque<(PlaybackInfo, i64)> = VecDeque::new();
    let mut ticker = tokio::time::interval(TICK);
    loop {
        let actions = tokio::select! {
            msg = rx.recv() => match msg {
                None => break,
                Some(Msg::Playback(info)) => scrobbler.update(info, now_ms(), unix_now()),
                Some(Msg::Enabled(on)) => { enabled = on; vec![] }
                Some(Msg::SessionChanged) => { session = load_session(); vec![] }
            },
            _ = ticker.tick() => scrobbler.tick(now_ms()),
        };
        let Some(sk) = session.as_ref().map(|s| s.key.clone()).filter(|_| enabled) else { continue };
        for action in actions {
            match action {
                Action::NowPlaying(info) => {
                    if let Err(e) = call(&client, "track.updateNowPlaying", track_params(&info), Some(&sk)).await {
                        eprintln!("[lastfm] now playing failed: {e}");
                    }
                }
                Action::Scrobble(info, at) => {
                    if pending.len() >= MAX_PENDING {
                        pending.pop_front(); // shortcut: offline backlog is capped and in-memory; persist it if users scrobble offline a lot
                    }
                    pending.push_back((info, at));
                }
            }
        }
        while let Some((info, at)) = pending.front().cloned() {
            let mut params = track_params(&info);
            params.push(("timestamp", at.to_string()));
            match call(&client, "track.scrobble", params, Some(&sk)).await {
                Ok(_) => {
                    pending.pop_front();
                }
                Err(ApiError::Lastfm(ERR_INVALID_SESSION, _)) => {
                    eprintln!("[lastfm] session revoked; sign in again in Settings");
                    let _ = clear_session();
                    session = None;
                    break;
                }
                Err(e) => {
                    eprintln!("[lastfm] scrobble failed, will retry: {e}");
                    break;
                }
            }
        }
    }
}

// ---------- commands ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastfmStatus {
    configured: bool,
    username: Option<String>,
}

#[tauri::command]
pub fn lastfm_status() -> LastfmStatus {
    LastfmStatus { configured: configured(), username: load_session().map(|s| s.name) }
}

#[tauri::command]
pub async fn lastfm_connect(app: AppHandle, state: tauri::State<'_, Lastfm>) -> Result<String, String> {
    let client = reqwest::Client::new();
    let token_body = call(&client, "auth.getToken", vec![], None).await.map_err(|e| e.to_string())?;
    let token = token_body.get("token").and_then(Value::as_str).ok_or("Last.fm sent no token")?.to_string();
    let url = format!("{AUTH_URL}?api_key={}&token={token}", API_KEY.unwrap_or_default());
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + AUTH_TIMEOUT;
    while Instant::now() < deadline {
        tokio::time::sleep(AUTH_POLL).await;
        match call(&client, "auth.getSession", vec![("token", token.clone())], None).await {
            Ok(body) => {
                let s = body.get("session").ok_or("Last.fm sent no session")?;
                let session = Session {
                    name: s.get("name").and_then(Value::as_str).unwrap_or_default().to_string(),
                    key: s.get("key").and_then(Value::as_str).ok_or("Last.fm sent no session key")?.to_string(),
                };
                let json = serde_json::to_string(&session).map_err(|e| e.to_string())?;
                keyring()?.set_password(&json).map_err(|e| format!("could not save Last.fm sign-in: {e}"))?;
                state.send(Msg::SessionChanged);
                return Ok(session.name);
            }
            Err(ApiError::Lastfm(ERR_UNAUTHORIZED_TOKEN, _)) => continue, // not approved yet
            Err(e) => return Err(format!("Last.fm sign-in failed: {e}")),
        }
    }
    Err("Timed out waiting for Last.fm approval".into())
}

#[tauri::command]
pub fn lastfm_disconnect(state: tauri::State<'_, Lastfm>) -> Result<(), String> {
    clear_session()?;
    state.send(Msg::SessionChanged);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::sample;

    #[test]
    fn signature_sorts_params_and_skips_format() {
        let params = vec![("track", "b".to_string()), ("api_key", "k".to_string()), ("format", "json".to_string())];
        assert_eq!(signature_base(&params, "S"), "api_keyktrackbS");
        assert_eq!(format!("{:x}", md5::compute("abc")), "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(sign(&params, "S"), format!("{:x}", md5::compute("api_keyktrackbS")));
    }

    #[test]
    fn eligibility_follows_lastfm_rules() {
        assert!(!eligible(25_000, 25_000)); // too short to ever scrobble
        assert!(!eligible(200_000, 99_000));
        assert!(eligible(200_000, 100_000)); // half
        assert!(eligible(600_000, 240_000)); // 4 minute cap
    }

    #[test]
    fn sends_now_playing_then_scrobbles_after_half() {
        let mut s = Scrobbler::default();
        let info = sample("t1", 200_000, 0, false);
        assert_eq!(s.update(Some(info.clone()), 0, 1_000), vec![Action::NowPlaying(info.clone())]);
        assert!(s.tick(50_000).is_empty());
        assert_eq!(s.tick(100_000), vec![Action::Scrobble(info.clone(), 1_000)]);
        assert!(s.tick(150_000).is_empty(), "only once per play");
    }

    #[test]
    fn paused_time_does_not_count() {
        let mut s = Scrobbler::default();
        s.update(Some(sample("t1", 200_000, 0, false)), 0, 1_000);
        s.update(Some(sample("t1", 200_000, 40_000, true)), 40_000, 1_040);
        assert!(s.tick(500_000).is_empty(), "paused for ages");
        s.update(Some(sample("t1", 200_000, 40_000, false)), 500_000, 1_500);
        assert_eq!(s.tick(560_000).len(), 1);
    }

    #[test]
    fn switching_tracks_scrobbles_the_finished_one() {
        let mut s = Scrobbler::default();
        let first = sample("t1", 100_000, 0, false);
        s.update(Some(first.clone()), 0, 1_000);
        let second = sample("t2", 100_000, 0, false);
        let actions = s.update(Some(second.clone()), 100_000, 1_100);
        assert_eq!(actions, vec![Action::Scrobble(first, 1_000), Action::NowPlaying(second)]);
    }
}
