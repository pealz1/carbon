//! ListenBrainz: "playing now" and listens with the listener's own user token (Settings). Timing
//! follows the Last.fm scrobbler's rules (it reuses `lastfm::Scrobbler`), but the two run apart:
//! either, both or neither can be on. Listens that can't be sent wait in a queue on disk and are
//! retried with backoff, so a listen made offline still arrives.
use crate::lastfm::{Action, Scrobbler};
use crate::playback::PlaybackInfo;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::VecDeque;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

const API_URL: &str = "https://api.listenbrainz.org/1";
const KEYRING_SERVICE: &str = "com.pealz.carbon";
const KEYRING_ACCOUNT: &str = "listenbrainz-token";
const QUEUE_FILE: &str = "listenbrainz-queue.json";
const CLIENT_NAME: &str = "Carbon";
/// Oldest listens are dropped past this; a full queue still fits one request (ListenBrainz allows 1000).
const MAX_QUEUE: usize = 1_000;
const BATCH: usize = 100;
const MAX_TOKEN_LEN: usize = 64;
const TICK: Duration = Duration::from_secs(10);
const TIMEOUT: Duration = Duration::from_secs(20);
/// ListenBrainz asks clients never to call more than once a second.
const PACE: Duration = Duration::from_secs(1);
const RETRY_MIN: Duration = Duration::from_secs(30);
const RETRY_MAX: Duration = Duration::from_secs(60 * 60);

// ---------- listens (pure) ----------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct AdditionalInfo {
    media_player: String,
    submission_client: String,
    submission_client_version: String,
    duration_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct TrackMetadata {
    artist_name: String,
    track_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    release_name: Option<String>,
    additional_info: AdditionalInfo,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct Listen {
    /// Absent for "playing now".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    listened_at: Option<i64>,
    track_metadata: TrackMetadata,
}

impl Listen {
    /// None when the track has no artist: ListenBrainz needs one.
    fn new(info: &PlaybackInfo, listened_at: Option<i64>) -> Option<Self> {
        let artist_name = info.artist_line();
        if artist_name.trim().is_empty() || info.title.trim().is_empty() {
            return None;
        }
        let track_metadata = TrackMetadata {
            artist_name,
            track_name: info.title.clone(),
            release_name: Some(info.album.clone()).filter(|a| !a.trim().is_empty()),
            additional_info: AdditionalInfo {
                media_player: CLIENT_NAME.into(),
                submission_client: CLIENT_NAME.into(),
                submission_client_version: env!("CARGO_PKG_VERSION").into(),
                duration_ms: info.duration_ms,
            },
        };
        Some(Self { listened_at, track_metadata })
    }
}

/// "single" for one listen, "import" for a batch from the queue.
fn body(listen_type: &str, listens: &[Listen]) -> Value {
    serde_json::json!({ "listen_type": listen_type, "payload": listens })
}

/// ListenBrainz user tokens are UUIDs; anything else is refused before it goes anywhere.
pub fn is_token(token: &str) -> bool {
    !token.is_empty() && token.len() <= MAX_TOKEN_LEN && token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

// ---------- responses and retries (pure) ----------

#[derive(Debug, PartialEq)]
enum SubmitError {
    /// The token was revoked: stop sending, keep the queue.
    Unauthorized,
    /// ListenBrainz refused these listens; retrying won't help.
    Rejected(String),
    RateLimited(Duration),
    /// Network trouble or a server error.
    Retry(String),
}

fn classify(status: u16, reset_in_s: Option<u64>, message: &str) -> Result<(), SubmitError> {
    match status {
        200..=299 => Ok(()),
        401 => Err(SubmitError::Unauthorized),
        429 => Err(SubmitError::RateLimited(reset_in_s.map_or(RETRY_MIN, |s| Duration::from_secs(s.max(1))))),
        400..=499 => Err(SubmitError::Rejected(format!("{status}: {message}"))),
        _ => Err(SubmitError::Retry(format!("{status}: {message}"))),
    }
}

/// 30 s, 1 min, 2 min … up to an hour.
fn retry_delay(failures: u32) -> Duration {
    RETRY_MIN.saturating_mul(1 << failures.saturating_sub(1).min(16)).min(RETRY_MAX)
}

/// Listens waiting to be sent, kept on disk, with the retry schedule.
struct Outbox {
    listens: VecDeque<Listen>,
    file: Option<PathBuf>,
    failures: u32,
    retry_at: Option<Instant>,
    /// After a refused batch, send one at a time to find and drop the listen that was refused.
    solo: bool,
}

impl Outbox {
    fn load(file: Option<PathBuf>) -> Self {
        let listens = file.as_ref().and_then(|f| fs::read_to_string(f).ok()).map_or_else(VecDeque::new, |text| {
            serde_json::from_str::<VecDeque<Listen>>(&text).unwrap_or_else(|e| {
                eprintln!("[listenbrainz] unreadable queue, starting empty: {e}");
                VecDeque::new()
            })
        });
        Self { listens, file, failures: 0, retry_at: None, solo: false }
    }

    fn save(&self) {
        let Some(file) = &self.file else { return };
        let result = (|| {
            if let Some(dir) = file.parent() {
                fs::create_dir_all(dir)?;
            }
            let tmp = file.with_extension("json.tmp");
            fs::write(&tmp, serde_json::to_vec(&self.listens)?)?;
            fs::rename(&tmp, file)
        })();
        if let Err(e) = result {
            eprintln!("[listenbrainz] couldn't save the queue (kept in memory): {e}");
        }
    }

    fn push(&mut self, listen: Listen) {
        if self.listens.len() >= MAX_QUEUE {
            self.listens.pop_front();
        }
        self.listens.push_back(listen);
        self.save();
    }

    /// Drops every queued listen, on disk too. Runs after any send in flight has saved what was left.
    fn forget(&mut self) {
        self.listens.clear();
        self.failures = 0;
        self.retry_at = None;
        self.solo = false;
        if let Some(Err(e)) = self.file.as_ref().map(fs::remove_file)
            && e.kind() != std::io::ErrorKind::NotFound
        {
            eprintln!("[listenbrainz] couldn't remove the queue: {e}");
        }
    }

    fn due(&self, now: Instant) -> bool {
        !self.listens.is_empty() && self.retry_at.is_none_or(|at| now >= at)
    }

    fn batch(&self) -> Vec<Listen> {
        self.listens.iter().take(if self.solo { 1 } else { BATCH }).cloned().collect()
    }

    /// Applies the result of sending `sent` listens from the front. False means stop sending for now.
    fn settle(&mut self, sent: usize, result: Result<(), SubmitError>, now: Instant) -> bool {
        match result {
            Ok(()) => {
                self.listens.drain(..sent.min(self.listens.len()));
                self.failures = 0;
                self.retry_at = None;
                self.solo &= !self.listens.is_empty();
                self.save();
                true
            }
            Err(SubmitError::Rejected(why)) if sent > 1 => {
                eprintln!("[listenbrainz] batch refused ({why}); sending one at a time");
                self.solo = true;
                true
            }
            Err(SubmitError::Rejected(why)) => {
                eprintln!("[listenbrainz] dropping a listen ListenBrainz refused: {why}");
                self.listens.pop_front();
                self.solo = false;
                self.save();
                true
            }
            Err(SubmitError::RateLimited(wait)) => {
                self.retry_at = Some(now + wait);
                false
            }
            Err(SubmitError::Retry(why)) => {
                self.failures += 1;
                let wait = retry_delay(self.failures);
                eprintln!("[listenbrainz] couldn't send listens, retrying in {}s: {why}", wait.as_secs());
                self.retry_at = Some(now + wait);
                false
            }
            Err(SubmitError::Unauthorized) => false,
        }
    }
}

// ---------- token storage ----------

#[derive(Serialize, Deserialize, Clone)]
struct Account {
    name: String,
    token: String,
}

fn keyring() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| format!("credential store unavailable: {e}"))
}

fn load_account() -> Option<Account> {
    let text = keyring().ok()?.get_password().ok()?;
    serde_json::from_str(&text).ok()
}

pub fn clear_token() -> Result<(), String> {
    match keyring()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not remove the ListenBrainz token: {e}")),
    }
}

// ---------- API ----------

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("Carbon/", env!("CARGO_PKG_VERSION")))
        .build()
        .unwrap_or_default()
}

async fn submit(client: &reqwest::Client, token: &str, listen_type: &str, listens: &[Listen]) -> Result<(), SubmitError> {
    let response = client
        .post(format!("{API_URL}/submit-listens"))
        .header("Authorization", format!("Token {token}"))
        .json(&body(listen_type, listens))
        .send()
        .await
        .map_err(|e| SubmitError::Retry(e.to_string()))?;
    let status = response.status().as_u16();
    let reset_in = response.headers().get("X-RateLimit-Reset-In").and_then(|v| v.to_str().ok()?.parse().ok());
    let text = response.text().await.unwrap_or_default();
    let message = serde_json::from_str::<Value>(&text).ok().and_then(|b| b.get("error")?.as_str().map(String::from)).unwrap_or_default();
    classify(status, reset_in, &message)
}

/// The account name for a token, or a plain reason it can't be used.
async fn validate(client: &reqwest::Client, token: &str) -> Result<String, String> {
    let response = client
        .get(format!("{API_URL}/validate-token"))
        .header("Authorization", format!("Token {token}"))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach ListenBrainz: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("ListenBrainz couldn't check the token ({}).", response.status().as_u16()));
    }
    let body: Value = response.json().await.map_err(|e| format!("ListenBrainz sent an unexpected reply: {e}"))?;
    match (body.get("valid").and_then(Value::as_bool), body.get("user_name").and_then(Value::as_str)) {
        (Some(true), Some(name)) if !name.is_empty() => Ok(name.to_string()),
        _ => Err("ListenBrainz didn't accept that token. Copy it again from your ListenBrainz settings.".into()),
    }
}

// ---------- worker ----------

pub enum Msg {
    Playback(Option<PlaybackInfo>),
    Enabled(bool),
    TokenChanged,
    /// Remove saved data: drop the queue too.
    Forget,
}

pub struct Listenbrainz(UnboundedSender<Msg>);

impl Listenbrainz {
    pub fn spawn(enabled: bool, queue: Option<PathBuf>) -> Self {
        let (tx, rx) = unbounded_channel();
        tauri::async_runtime::spawn(run(rx, enabled, queue));
        Self(tx)
    }

    pub fn send(&self, msg: Msg) {
        let _ = self.0.send(msg); // only fails once the app is shutting down
    }
}

pub fn queue_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(QUEUE_FILE))
}

/// Forgets the token and the queued listens (Settings → Remove saved data).
pub fn forget(app: &AppHandle) -> Result<(), String> {
    clear_token()?;
    app.state::<Listenbrainz>().send(Msg::Forget);
    match queue_path(app).map(fs::remove_file) {
        Some(Err(e)) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("could not remove queued listens: {e}")),
        _ => Ok(()),
    }
}

fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

async fn run(mut rx: UnboundedReceiver<Msg>, mut enabled: bool, queue: Option<PathBuf>) {
    let client = client();
    let clock = Instant::now();
    let now_ms = || clock.elapsed().as_millis() as u64;
    let mut account = load_account();
    let mut scrobbler = Scrobbler::default();
    let mut outbox = Outbox::load(queue);
    let mut ticker = tokio::time::interval(TICK);
    loop {
        let actions = tokio::select! {
            msg = rx.recv() => match msg {
                None => break,
                Some(Msg::Playback(info)) => scrobbler.update(info, now_ms(), unix_now()),
                Some(Msg::Enabled(on)) => { enabled = on; vec![] }
                Some(Msg::TokenChanged) => { account = load_account(); vec![] }
                Some(Msg::Forget) => { account = None; outbox.forget(); vec![] }
            },
            _ = ticker.tick() => scrobbler.tick(now_ms()),
        };
        // Listens made while off or without a token are not kept.
        let Some(token) = account.as_ref().filter(|_| enabled).map(|a| a.token.clone()) else { continue };
        for action in actions {
            match action {
                Action::NowPlaying(info) => {
                    let Some(listen) = Listen::new(&info, None) else { continue };
                    if let Err(e) = submit(&client, &token, "playing_now", &[listen]).await {
                        eprintln!("[listenbrainz] playing now failed: {e:?}");
                    }
                }
                Action::Scrobble(info, at) => match Listen::new(&info, Some(at)) {
                    Some(listen) => outbox.push(listen),
                    None => eprintln!("[listenbrainz] skipped a listen without an artist"),
                },
            }
        }
        if !flush(&client, &token, &mut outbox).await {
            eprintln!("[listenbrainz] token no longer accepted; enter it again in Settings");
            let _ = clear_token();
            account = None;
        }
    }
}

/// Sends what's due, oldest first, a second apart (also from a "playing now" just sent). False when
/// the token was refused.
async fn flush(client: &reqwest::Client, token: &str, outbox: &mut Outbox) -> bool {
    while outbox.due(Instant::now()) {
        tokio::time::sleep(PACE).await;
        let batch = outbox.batch();
        let kind = if batch.len() == 1 { "single" } else { "import" };
        let result = submit(client, token, kind, &batch).await;
        if result == Err(SubmitError::Unauthorized) {
            return false;
        }
        if !outbox.settle(batch.len(), result, Instant::now()) {
            break;
        }
    }
    true
}

// ---------- commands ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenbrainzStatus {
    username: Option<String>,
}

#[tauri::command]
pub fn listenbrainz_status() -> ListenbrainzStatus {
    ListenbrainzStatus { username: load_account().map(|a| a.name) }
}

/// Checks the token with ListenBrainz, then keeps it in Windows Credential Manager.
#[tauri::command]
pub async fn listenbrainz_connect(token: String, state: tauri::State<'_, Listenbrainz>) -> Result<String, String> {
    let token = token.trim().to_string();
    if !is_token(&token) {
        return Err("That doesn't look like a ListenBrainz user token.".into());
    }
    let name = validate(&client(), &token).await?;
    let json = serde_json::to_string(&Account { name: name.clone(), token }).map_err(|e| e.to_string())?;
    keyring()?.set_password(&json).map_err(|e| format!("could not save the ListenBrainz token: {e}"))?;
    state.send(Msg::TokenChanged);
    Ok(name)
}

#[tauri::command]
pub fn listenbrainz_disconnect(state: tauri::State<'_, Listenbrainz>) -> Result<(), String> {
    clear_token()?;
    state.send(Msg::TokenChanged);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::sample;

    fn listen(at: i64) -> Listen {
        Listen::new(&sample("t1", 200_000, 0, false), Some(at)).expect("has an artist")
    }

    fn outbox(n: i64) -> Outbox {
        let mut o = Outbox::load(None);
        (0..n).for_each(|i| o.push(listen(i)));
        o
    }

    #[test]
    fn builds_listenbrainz_payloads() {
        let info = sample("t1", 200_000, 0, false);
        let now = body("playing_now", &[Listen::new(&info, None).unwrap()]);
        let item = &now["payload"][0];
        assert!(item.get("listened_at").is_none(), "playing now has no timestamp");
        assert_eq!(item["track_metadata"]["track_name"], info.title.as_str());
        assert_eq!(item["track_metadata"]["artist_name"], info.artist_line().as_str());
        assert_eq!(item["track_metadata"]["additional_info"]["duration_ms"], 200_000);
        assert_eq!(item["track_metadata"]["additional_info"]["submission_client"], "Carbon");
        let single = body("single", &[listen(1_700_000_000)]);
        assert_eq!(single["listen_type"], "single");
        assert_eq!(single["payload"][0]["listened_at"], 1_700_000_000);
    }

    #[test]
    fn skips_tracks_without_an_artist_and_empty_albums() {
        let mut info = sample("t1", 200_000, 0, false);
        info.album = String::new();
        assert_eq!(Listen::new(&info, None).unwrap().track_metadata.release_name, None);
        info.artists = vec![];
        assert!(Listen::new(&info, None).is_none());
    }

    #[test]
    fn accepts_only_token_shaped_input() {
        assert!(is_token("0b1f6d2c-3a4e-4b5c-9d8e-7f6a5b4c3d2e"));
        assert!(!is_token(""));
        assert!(!is_token("has space"));
        assert!(!is_token("line\nbreak"));
        assert!(!is_token(&"a".repeat(65)));
    }

    #[test]
    fn classifies_responses() {
        assert_eq!(classify(200, None, ""), Ok(()));
        assert_eq!(classify(401, None, "bad token"), Err(SubmitError::Unauthorized));
        assert_eq!(classify(429, Some(7), ""), Err(SubmitError::RateLimited(Duration::from_secs(7))));
        assert_eq!(classify(429, None, ""), Err(SubmitError::RateLimited(RETRY_MIN)));
        assert!(matches!(classify(400, None, "no artist"), Err(SubmitError::Rejected(_))));
        assert!(matches!(classify(503, None, ""), Err(SubmitError::Retry(_))));
    }

    #[test]
    fn backs_off_up_to_an_hour() {
        assert_eq!(retry_delay(1), Duration::from_secs(30));
        assert_eq!(retry_delay(2), Duration::from_secs(60));
        assert_eq!(retry_delay(4), Duration::from_secs(240));
        assert_eq!(retry_delay(40), RETRY_MAX);
    }

    #[test]
    fn caps_the_queue_and_sends_oldest_first() {
        let o = outbox(MAX_QUEUE as i64 + 5);
        assert_eq!(o.listens.len(), MAX_QUEUE);
        assert_eq!(o.listens.front().unwrap().listened_at, Some(5));
        assert_eq!(o.batch().len(), BATCH);
    }

    #[test]
    fn retries_later_and_resets_after_success() {
        let start = Instant::now();
        let mut o = outbox(3);
        assert!(!o.settle(3, Err(SubmitError::Retry("offline".into())), start));
        assert!(!o.due(start + Duration::from_secs(29)));
        assert!(o.due(start + Duration::from_secs(30)));
        assert!(!o.settle(3, Err(SubmitError::Retry("offline".into())), start));
        assert_eq!(o.retry_at, Some(start + Duration::from_secs(60)));
        assert!(o.settle(3, Ok(()), start));
        assert!(o.listens.is_empty());
        assert_eq!((o.failures, o.retry_at), (0, None));
    }

    #[test]
    fn waits_out_rate_limits() {
        let start = Instant::now();
        let mut o = outbox(1);
        assert!(!o.settle(1, Err(SubmitError::RateLimited(Duration::from_secs(5))), start));
        assert!(!o.due(start + Duration::from_secs(4)));
        assert_eq!(o.listens.len(), 1);
    }

    #[test]
    fn finds_and_drops_a_refused_listen_without_losing_the_rest() {
        let now = Instant::now();
        let mut o = outbox(3);
        assert!(o.settle(3, Err(SubmitError::Rejected("bad".into())), now));
        assert_eq!(o.batch().len(), 1, "one at a time after a refused batch");
        assert!(o.settle(1, Ok(()), now));
        assert!(o.settle(1, Err(SubmitError::Rejected("bad".into())), now));
        assert_eq!(o.listens.iter().map(|l| l.listened_at).collect::<Vec<_>>(), vec![Some(2)]);
        assert_eq!(o.batch().len(), 1);
        assert!(!o.solo, "back to batches once the refused listen is gone");
    }

    #[test]
    fn keeps_listens_when_the_token_is_refused() {
        let mut o = outbox(2);
        assert!(!o.settle(2, Err(SubmitError::Unauthorized), Instant::now()));
        assert_eq!(o.listens.len(), 2);
    }

    #[test]
    fn persists_the_queue_across_restarts() {
        let dir = std::env::temp_dir().join(format!("carbon-lb-test-{}", std::process::id()));
        let file = dir.join(QUEUE_FILE);
        let mut o = Outbox::load(Some(file.clone()));
        o.push(listen(42));
        let reloaded = Outbox::load(Some(file.clone()));
        assert_eq!(reloaded.listens, VecDeque::from([listen(42)]));
        fs::write(&file, "not json").unwrap();
        assert!(Outbox::load(Some(file.clone())).listens.is_empty(), "a corrupt queue starts empty");
        let mut saved = Outbox::load(Some(file.clone()));
        saved.push(listen(43));
        saved.forget();
        assert!(saved.listens.is_empty() && !file.exists(), "forgetting removes the file");
        let _ = fs::remove_dir_all(dir);
    }
}
