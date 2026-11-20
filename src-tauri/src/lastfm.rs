//! Optional Last.fm scrobbling through the authenticated Carbon API.
use crate::playback::PlaybackInfo;
use crate::token_store::CarbonApi;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

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
/// Last.fm's codes for "this request is wrong": invalid parameters, invalid resource. Sending the same
/// scrobble again can't help, so it is dropped. Everything else (busy, offline, a problem with Carbon's
/// own key) says nothing about the scrobble, so it waits.
const ERR_REJECTED: [i64; 2] = [6, 7];
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// A repeat of the same song: the position is back near the start after it was scrobbled.
const RESTART_WITHIN_MS: u64 = 5_000;

pub fn configured(api_url: &str) -> bool {
    CarbonApi::parse(api_url).and_then(|api| api.token()).ok().flatten().is_some()
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
        let restarted = self.current.as_ref().is_some_and(|c| same_track && c.scrobbled && info.position_ms < RESTART_WITHIN_MS && c.info.position_ms > info.position_ms);
        if same_track && !restarted {
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
    connection: String,
    carbon_session_hash: String,
}

fn session_hash(bearer: &str) -> String { format!("{:x}", Sha256::digest(bearer.as_bytes())) }

fn keyring(api: &CarbonApi) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, &api.credential_name(KEYRING_ACCOUNT)).map_err(|e| e.to_string())
}

fn load_session(api: &CarbonApi) -> Option<Session> {
    let text = keyring(api).ok()?.get_password().ok()?;
    serde_json::from_str(&text).ok()
}

pub(crate) fn clear_session(api: &CarbonApi) -> Result<(), String> {
    crate::token_store::clear(&api.credential_name(KEYRING_ACCOUNT))?;
    crate::token_store::clear(KEYRING_ACCOUNT)
}

// ---------- API ----------

#[derive(Debug)]
enum ApiError {
    Lastfm(i64, String),
    Network(String),
}

/// Worth sending again later: anything but Last.fm rejecting the scrobble itself.
fn retryable(e: &ApiError) -> bool {
    match e {
        ApiError::Network(_) => true,
        ApiError::Lastfm(code, _) => !ERR_REJECTED.contains(code),
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Lastfm(code, message) => write!(f, "Last.fm error {code}: {message}"),
            Self::Network(message) => write!(f, "couldn't reach Last.fm: {message}"),
        }
    }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(REQUEST_TIMEOUT).redirect(reqwest::redirect::Policy::none())
        .build().map_err(|e| e.to_string())
}

async fn call(client: &reqwest::Client, api: &CarbonApi, bearer: &str, route: &str, request: &Value) -> Result<Value, ApiError> {
    let response = client.post(format!("{}/v1/lastfm/{route}", api.url())).bearer_auth(bearer).json(request)
        .send().await.map_err(|e| ApiError::Network(e.to_string()))?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|e| ApiError::Network(e.to_string()))?;
    if !status.is_success() {
        let error = &body["error"];
        let code = error["code"].as_str().unwrap_or_default();
        let message = error["message"].as_str().unwrap_or("Carbon could not complete the Last.fm request").to_owned();
        if code == "lastfm_reconnect" { return Err(ApiError::Lastfm(ERR_INVALID_SESSION, message)); }
        if let Some(n) = code.strip_prefix("lastfm_").and_then(|s| s.parse().ok()) { return Err(ApiError::Lastfm(n, message)); }
        if code == "invalid_request" { return Err(ApiError::Lastfm(6, message)); }
        return Err(ApiError::Network(message));
    }
    Ok(body)
}

fn track_body(info: &PlaybackInfo, connection: &str) -> Value {
    json!({ "connection": connection, "artist": info.artists.first().map(String::as_str).unwrap_or(""),
        "track": info.title, "album": info.album, "duration": info.duration_ms / 1000 })
}

// ---------- worker ----------

pub(crate) enum Msg {
    AccountApi(CarbonApi),
    Playback(Option<PlaybackInfo>),
    Enabled(bool),
    SessionChanged,
}

pub struct Lastfm(UnboundedSender<Msg>);

impl Lastfm {
    pub fn spawn(enabled: bool) -> Self {
        let (tx, rx) = unbounded_channel();
        tauri::async_runtime::spawn(run(rx, enabled));
        Self(tx)
    }

    pub(crate) fn send(&self, msg: Msg) {
        let _ = self.0.send(msg);
    }
}

fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

async fn run(mut rx: UnboundedReceiver<Msg>, mut enabled: bool) {
    let Ok(client) = client() else { return };
    let clock = Instant::now();
    let now_ms = || clock.elapsed().as_millis() as u64;
    let mut active_api = None;
    let mut session = None;
    let mut scrobbler = Scrobbler::default();
    let mut pending: VecDeque<(PlaybackInfo, i64)> = VecDeque::new();
    let mut ticker = tokio::time::interval(TICK);
    loop {
        let actions = tokio::select! {
            msg = rx.recv() => match msg {
                None => break,
                Some(Msg::Playback(info)) if enabled && session.is_some() => scrobbler.update(info, now_ms(), unix_now()),
                Some(Msg::Playback(_)) => vec![],
                Some(Msg::AccountApi(api)) => {
                    if active_api.as_ref() != Some(&api) {
                        session = load_session(&api);
                        active_api = Some(api);
                        pending.clear();
                        scrobbler = Scrobbler::default();
                    }
                    vec![]
                }
                Some(Msg::Enabled(on)) => {
                    if enabled != on { enabled = on; pending.clear(); scrobbler = Scrobbler::default(); }
                    vec![]
                }
                Some(Msg::SessionChanged) => { session = active_api.as_ref().and_then(load_session); pending.clear(); scrobbler = Scrobbler::default(); vec![] }
            },
            _ = ticker.tick() => scrobbler.tick(now_ms()),
        };
        if !enabled || (actions.is_empty() && pending.is_empty()) { continue; }
        let (Some(link), Some(api)) = (session.as_ref(), active_api.as_ref()) else { continue };
        let Ok(bearer) = api.token() else { continue };
        let Some(bearer) = bearer.filter(|value| session_hash(value) == link.carbon_session_hash) else {
            pending.clear();
            scrobbler = Scrobbler::default();
            session = None;
            continue;
        };
        let connection = link.connection.clone();
        for action in actions {
            match action {
                Action::NowPlaying(info) => {
                    if let Err(e) = call(&client, api, &bearer, "now-playing", &track_body(&info, &connection)).await {
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
        // Let queued privacy and account changes take effect before another submission.
        while rx.is_empty() {
            let Some((info, at)) = pending.front().cloned() else { break };
            let mut body = track_body(&info, &connection);
            body["timestamp"] = json!(at);
            match call(&client, api, &bearer, "scrobble", &body).await {
                Ok(_) => {
                    pending.pop_front();
                }
                Err(ApiError::Lastfm(ERR_INVALID_SESSION, _)) => {
                    eprintln!("[lastfm] session revoked; sign in again in Settings");
                    if load_session(api).is_some_and(|current| current.connection == connection) { let _ = clear_session(api); }
                    session = None;
                    pending.clear();
                    break;
                }
                Err(e) if retryable(&e) => {
                    eprintln!("[lastfm] scrobble failed, will retry: {e}");
                    break;
                }
                Err(e) => {
                    // Last.fm refused this one (bad artist, too old…): keeping it would block every later scrobble.
                    eprintln!("[lastfm] scrobble refused, dropping it: {e}");
                    pending.pop_front();
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
pub fn lastfm_status(api_url: String) -> LastfmStatus {
    let Ok(api) = CarbonApi::parse(&api_url) else { return LastfmStatus { configured: false, username: None } };
    let bearer = api.token().ok().flatten();
    let username = bearer.as_deref().and_then(|b| load_session(&api).filter(|s| s.carbon_session_hash == session_hash(b))).map(|s| s.name);
    LastfmStatus { configured: bearer.is_some(), username }
}

#[tauri::command]
pub async fn lastfm_connect(api_url: String, app: AppHandle, state: tauri::State<'_, Lastfm>) -> Result<String, String> {
    let api = CarbonApi::parse(&api_url)?;
    let client = client()?;
    let bearer = api.token()?.ok_or("Sign in to Carbon to use Last.fm.")?;
    let start = call(&client, &api, &bearer, "connect", &json!({})).await.map_err(|e| e.to_string())?;
    let token = start["token"].as_str().ok_or("Last.fm sent no token")?;
    let key = start["apiKey"].as_str().ok_or("Last.fm configuration unavailable")?;
    let challenge = start["challenge"].as_str().ok_or("Last.fm approval unavailable")?;
    let url = reqwest::Url::parse_with_params(AUTH_URL, &[("api_key", key), ("token", token)]).map_err(|e| e.to_string())?;
    app.opener().open_url(url.as_str(), None::<&str>).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + AUTH_TIMEOUT;
    while Instant::now() < deadline {
        tokio::time::sleep(AUTH_POLL).await;
        match call(&client, &api, &bearer, "session", &json!({ "challenge": challenge })).await {
            Ok(body) => {
                let session = Session {
                    name: body["username"].as_str().ok_or("Last.fm sent no username")?.to_owned(),
                    connection: body["connection"].as_str().ok_or("Last.fm sent no connection")?.to_owned(),
                    carbon_session_hash: session_hash(&bearer),
                };
                if api.token()?.as_deref() != Some(&bearer) {
                    return Err("Your Carbon account changed. Connect Last.fm again.".into());
                }
                let json = serde_json::to_string(&session).map_err(|e| e.to_string())?;
                keyring(&api)?.set_password(&json).map_err(|e| format!("could not save Last.fm sign-in: {e}"))?;
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
pub fn lastfm_disconnect(api_url: String, state: tauri::State<'_, Lastfm>) -> Result<(), String> {
    clear_session(&CarbonApi::parse(&api_url)?)?;
    state.send(Msg::SessionChanged);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::sample;

    #[tokio::test]
    async fn signing_uses_the_selected_accounts_server() {
        use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
        let server = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let api = CarbonApi::parse(&format!("http://{}/accounts", server.local_addr().unwrap())).unwrap();
        let reply = async {
            let (mut stream, _) = server.accept().await.unwrap();
            let mut lines = BufReader::new(&mut stream).lines();
            assert_eq!(lines.next_line().await.unwrap().unwrap(), "POST /accounts/v1/lastfm/connect HTTP/1.1");
            let mut authenticated = false;
            while let Some(line) = lines.next_line().await.unwrap() {
                if line.is_empty() { break; }
                authenticated |= line.eq_ignore_ascii_case("Authorization: Bearer fixture-session");
            }
            assert!(authenticated);
            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}").await.unwrap();
        };
        let client = client().unwrap();
        let request = json!({});
        let (result, ()) = tokio::time::timeout(Duration::from_secs(5), async {
            tokio::join!(call(&client, &api, "fixture-session", "connect", &request), reply)
        }).await.unwrap();
        assert_eq!(result.unwrap(), json!({}));
    }

    #[test]
    fn existing_direct_sessions_require_consent_to_connect_through_carbon() {
        assert!(serde_json::from_value::<Session>(json!({"name":"listener","key":"old-device-key"})).is_err());
        let link: Session = serde_json::from_value(json!({"name":"listener","connection":"sealed","carbon_session_hash":session_hash("first")})).unwrap();
        assert_ne!(link.carbon_session_hash, session_hash("second"));
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
    fn a_song_on_repeat_scrobbles_each_time_round() {
        let mut s = Scrobbler::default();
        let info = sample("t1", 200_000, 0, false);
        s.update(Some(info.clone()), 0, 1_000);
        assert_eq!(s.tick(100_000).len(), 1);
        s.update(Some(sample("t1", 200_000, 150_000, false)), 150_000, 1_150); // an ordinary report mid-song
        let again = s.update(Some(sample("t1", 200_000, 500, false)), 200_500, 1_200); // back at the start
        assert!(matches!(again.as_slice(), [Action::NowPlaying(_)]));
        assert_eq!(s.tick(310_000).len(), 1, "the second play counts on its own");
    }

    #[test]
    fn only_busy_or_unreachable_is_worth_retrying() {
        assert!(retryable(&ApiError::Network("offline".into())));
        assert!(retryable(&ApiError::Lastfm(29, "rate limit".into())));
        assert!(retryable(&ApiError::Lastfm(8, "operation failed".into())));
        assert!(retryable(&ApiError::Lastfm(10, "invalid api key".into())), "a problem with Carbon's key must not drain the backlog");
        assert!(!retryable(&ApiError::Lastfm(6, "invalid parameters".into())));
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
