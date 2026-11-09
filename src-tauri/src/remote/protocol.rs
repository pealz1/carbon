//! The remote protocol (docs/remote-protocol.md): what remotes receive, and turning what they
//! send into player commands. Anything that doesn't validate is dropped.
use crate::media_controls::MediaCommand;
use crate::playback::{MAX_DURATION_MS, PlaybackInfo, QueueItem, RepeatMode};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

/// Bump on breaking changes to events or payloads.
pub const PROTOCOL_VERSION: u32 = 1;
/// Position-only updates go out at most this often; remotes extrapolate in between.
pub const POSITION_THROTTLE: Duration = Duration::from_secs(1);
pub const COMMAND_EVENTS: [&str; 10] =
    ["play", "pause", "toggle", "next", "previous", "seek", "volume", "shuffle", "repeat", "playUri"];
const SPOTIFY_ID_LEN: usize = 22;
const URI_KINDS: [&str; 4] = ["track", "album", "playlist", "artist"];

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Hello {
    pub app_version: String,
    pub protocol_version: u32,
    /// Only for a remote that paired with the code, which expires: the token to reconnect with.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// The `state` payload. An explicit allowlist, so new PlaybackInfo fields never leak to remotes.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RemoteState {
    pub track_id: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub artwork_url: Option<String>,
    pub duration_ms: u64,
    pub position_ms: u64,
    pub paused: bool,
    pub shuffle: bool,
    pub repeat: RepeatMode,
    pub volume: Option<f64>,
    pub queue: Vec<QueueItem>,
}

impl From<&PlaybackInfo> for RemoteState {
    fn from(info: &PlaybackInfo) -> Self {
        Self {
            track_id: info.track_id.clone(),
            title: info.title.clone(),
            artists: info.artists.clone(),
            album: info.album.clone(),
            artwork_url: info.artwork_url.clone(),
            duration_ms: info.duration_ms,
            position_ms: info.position_ms.min(info.duration_ms),
            paused: info.paused,
            shuffle: info.shuffle.unwrap_or(false),
            repeat: info.repeat.unwrap_or(RepeatMode::Off),
            volume: info.volume,
            queue: info.queue.clone().unwrap_or_default(),
        }
    }
}

/// `spotify:<track|album|playlist|artist>:<22 base62 characters>`.
pub fn is_spotify_uri(uri: &str) -> bool {
    let mut parts = uri.split(':');
    let (Some("spotify"), Some(kind), Some(id), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    URI_KINDS.contains(&kind) && id.len() == SPOTIFY_ID_LEN && id.chars().all(|c| c.is_ascii_alphanumeric())
}

fn field<'a>(data: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    data?.as_object()?.get(key)
}

/// Validates one inbound event. None means "drop it".
pub fn parse_command(event: &str, data: Option<&Value>) -> Option<MediaCommand> {
    Some(match event {
        "play" => MediaCommand::Play,
        "pause" => MediaCommand::Pause,
        "toggle" => MediaCommand::Toggle,
        "next" => MediaCommand::Next,
        "previous" => MediaCommand::Previous,
        "seek" => {
            let ms = field(data, "positionMs")?.as_f64().filter(|ms| (0.0..=MAX_DURATION_MS as f64).contains(ms))?;
            MediaCommand::Seek { position_ms: ms.round() as u64 }
        }
        "volume" => MediaCommand::Volume { value: field(data, "value")?.as_f64().filter(|v| (0.0..=1.0).contains(v))? },
        "shuffle" => MediaCommand::Shuffle { on: field(data, "on")?.as_bool()? },
        "repeat" => MediaCommand::Repeat { mode: serde_json::from_value(field(data, "mode")?.clone()).ok()? },
        "playUri" => {
            let uri = field(data, "uri")?.as_str().filter(|u| is_spotify_uri(u))?;
            MediaCommand::PlayUri { uri: uri.to_owned() }
        }
        _ => return None,
    })
}

/// When to send `next` to remotes: None = nothing new, zero = now, otherwise wait that long
/// (position-only changes are throttled; track, pause, shuffle, repeat, volume and queue are not).
pub fn send_delay(
    last: Option<&Option<RemoteState>>,
    next: &Option<RemoteState>,
    since_last: Duration,
) -> Option<Duration> {
    let Some(last) = last else { return Some(Duration::ZERO) };
    if last == next {
        return None;
    }
    let position_only = match (last, next) {
        (Some(a), Some(b)) => RemoteState { position_ms: 0, ..a.clone() } == RemoteState { position_ms: 0, ..b.clone() },
        _ => false,
    };
    Some(if position_only { POSITION_THROTTLE.saturating_sub(since_last) } else { Duration::ZERO })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::sample;
    use serde_json::json;

    const URI: &str = "spotify:track:6rqhFgbbKwnb9MLmUQDhG6";

    fn parse(event: &str, data: Value) -> Option<MediaCommand> {
        parse_command(event, Some(&data))
    }

    #[test]
    fn parses_valid_commands() {
        assert_eq!(parse_command("toggle", None), Some(MediaCommand::Toggle));
        assert_eq!(parse("seek", json!({ "positionMs": 61_500 })), Some(MediaCommand::Seek { position_ms: 61_500 }));
        assert_eq!(parse("seek", json!({ "positionMs": 10.6 })), Some(MediaCommand::Seek { position_ms: 11 }));
        assert_eq!(parse("volume", json!({ "value": 0.25 })), Some(MediaCommand::Volume { value: 0.25 }));
        assert_eq!(parse("shuffle", json!({ "on": false })), Some(MediaCommand::Shuffle { on: false }));
        assert_eq!(parse("repeat", json!({ "mode": "context" })), Some(MediaCommand::Repeat { mode: RepeatMode::Context }));
        assert_eq!(parse("playUri", json!({ "uri": URI })), Some(MediaCommand::PlayUri { uri: URI.into() }));
    }

    #[test]
    fn drops_invalid_commands() {
        assert_eq!(parse("seek", json!({ "positionMs": -1 })), None);
        assert_eq!(parse("seek", json!({ "positionMs": "10" })), None);
        assert_eq!(parse("seek", json!({ "positionMs": 1e12 })), None);
        assert_eq!(parse_command("seek", None), None);
        assert_eq!(parse("volume", json!({ "value": 1.01 })), None);
        assert_eq!(parse("volume", json!(0.5)), None);
        assert_eq!(parse("shuffle", json!({ "on": "yes" })), None);
        assert_eq!(parse("repeat", json!({ "mode": "forever" })), None);
        assert_eq!(parse("playUri", json!({ "uri": "https://open.spotify.com/track/x" })), None);
        assert_eq!(parse("quit", json!({})), None);
        assert_eq!(parse("token", json!({})), None);
    }

    #[test]
    fn accepts_only_spotify_uris() {
        assert!(is_spotify_uri(URI));
        assert!(is_spotify_uri("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"));
        assert!(!is_spotify_uri("spotify:user:someone"));
        assert!(!is_spotify_uri("spotify:track:6rqhFgbbKwnb9MLmUQDhG"));
        assert!(!is_spotify_uri("spotify:track:6rqhFgbbKwnb9MLmUQDhG6:extra"));
        assert!(!is_spotify_uri("spotify:track:6rqhFgbbKwnb9MLmUQDh-6"));
        assert!(!is_spotify_uri("javascript:alert(1)"));
    }

    #[test]
    fn maps_playback_to_an_allowlisted_state() {
        let state = RemoteState::from(&sample("t1", 1000, 1200, true));
        assert_eq!(state.position_ms, 1000);
        assert_eq!((state.shuffle, state.repeat, state.volume), (false, RepeatMode::Off, None));
        let json = serde_json::to_value(&state).unwrap();
        let keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(keys.len(), 12);
        assert!(json.get("artworkUrl").is_some() && json.get("queue").is_some());
    }

    #[test]
    fn throttles_position_but_not_other_changes() {
        let state = |track: &str, position: u64, paused: bool| Some(RemoteState::from(&sample(track, 9000, position, paused)));
        let early = Duration::from_millis(300);
        assert_eq!(send_delay(None, &state("a", 0, false), early), Some(Duration::ZERO));
        assert_eq!(send_delay(Some(&state("a", 0, false)), &state("a", 0, false), early), None);
        assert_eq!(send_delay(Some(&state("a", 0, false)), &state("a", 500, false), early), Some(Duration::from_millis(700)));
        assert_eq!(send_delay(Some(&state("a", 0, false)), &state("a", 500, false), POSITION_THROTTLE), Some(Duration::ZERO));
        assert_eq!(send_delay(Some(&state("a", 0, false)), &state("b", 0, false), early), Some(Duration::ZERO));
        assert_eq!(send_delay(Some(&state("a", 0, false)), &state("a", 500, true), early), Some(Duration::ZERO));
        assert_eq!(send_delay(Some(&state("a", 0, false)), &None, early), Some(Duration::ZERO));
    }
}
