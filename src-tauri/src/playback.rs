//! What's playing, as reported by the webview player. Fanned out to the OS media controls,
//! tray, Discord and Last.fm.
use serde::{Deserialize, Serialize};

const MAX_TEXT: usize = 512;
pub const MAX_DURATION_MS: u64 = 24 * 60 * 60 * 1000;
const MAX_QUEUE: usize = 10;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum RepeatMode {
    Off,
    Context,
    Track,
}

/// Where the song comes from, for attribution (song notifications).
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Spotify,
    Youtube,
    Local,
    Radio,
    /// The listener's own server (Navidrome, Jellyfin).
    Server,
}

impl Source {
    pub fn label(self) -> &'static str {
        match self {
            Source::Spotify => "Spotify",
            Source::Youtube => "YouTube Music",
            Source::Local => "On this PC",
            Source::Radio => "Radio",
            Source::Server => "Your server",
        }
    }
}

/// An upcoming track, as shown in a queue preview.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct QueueItem {
    pub title: String,
    pub artists: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackInfo {
    pub track_id: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub artwork_url: Option<String>,
    pub duration_ms: u64,
    pub position_ms: u64,
    pub paused: bool,
    // Optional so older reporters keep working; the phone remote shows them when present.
    pub shuffle: Option<bool>,
    pub repeat: Option<RepeatMode>,
    pub volume: Option<f64>,
    pub queue: Option<Vec<QueueItem>>,
    pub source: Option<Source>,
}

impl PlaybackInfo {
    /// Bounds-checks data arriving from the webview before it reaches the OS or the network.
    pub fn validate(&self) -> Result<(), String> {
        let queue = self.queue.as_deref().unwrap_or_default();
        let queued = queue.iter().flat_map(|q| std::iter::once(&q.title).chain(q.artists.iter()));
        let texts = [&self.track_id, &self.title, &self.album].into_iter().chain(self.artists.iter()).chain(queued);
        let too_many_artists = self.artists.len() > 32 || queue.iter().any(|q| q.artists.len() > 32);
        if texts.into_iter().any(|t| t.len() > MAX_TEXT) || too_many_artists || queue.len() > MAX_QUEUE {
            return Err("playback info is too large".into());
        }
        if self.volume.is_some_and(|v| !(0.0..=1.0).contains(&v)) {
            return Err("volume must be between 0 and 1".into());
        }
        if self.track_id.is_empty() || self.title.is_empty() {
            return Err("playback info is missing a track".into());
        }
        if self.duration_ms > MAX_DURATION_MS || self.position_ms > self.duration_ms.saturating_add(5_000) {
            return Err("playback timing is out of range".into());
        }
        if let Some(url) = &self.artwork_url
            && (!url.starts_with("https://") || url.len() > MAX_TEXT)
        {
            return Err("artwork must be an https URL".into());
        }
        Ok(())
    }

    pub fn artist_line(&self) -> String {
        self.artists.join(", ")
    }
}

#[cfg(test)]
pub fn sample(track_id: &str, duration_ms: u64, position_ms: u64, paused: bool) -> PlaybackInfo {
    PlaybackInfo {
        track_id: track_id.into(),
        title: "No Surprises".into(),
        artists: vec!["Radiohead".into()],
        album: "OK Computer".into(),
        artwork_url: Some("https://i.scdn.co/image/abc".into()),
        duration_ms,
        position_ms,
        paused,
        shuffle: None,
        repeat: None,
        volume: None,
        queue: None,
        source: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_playback() {
        assert!(sample("t1", 229_000, 10_000, false).validate().is_ok());
    }

    #[test]
    fn rejects_bad_input() {
        let mut info = sample("t1", 229_000, 10_000, false);
        info.artwork_url = Some("http://insecure".into());
        assert!(info.validate().is_err());
        assert!(sample("", 1000, 0, false).validate().is_err());
        assert!(sample("t1", 1000, 60_000, false).validate().is_err());
        let mut long = sample("t1", 1000, 0, false);
        long.title = "x".repeat(MAX_TEXT + 1);
        assert!(long.validate().is_err());
    }

    #[test]
    fn checks_optional_remote_fields() {
        let mut info = sample("t1", 1000, 0, false);
        info.volume = Some(0.4);
        info.repeat = Some(RepeatMode::Track);
        info.queue = Some(vec![QueueItem { title: "Lucky".into(), artists: vec!["Radiohead".into()] }]);
        assert!(info.validate().is_ok());
        info.volume = Some(f64::NAN);
        assert!(info.validate().is_err());
        info.volume = Some(1.5);
        assert!(info.validate().is_err());
        info.volume = None;
        info.queue = Some(vec![QueueItem { title: "x".repeat(MAX_TEXT + 1), artists: vec![] }]);
        assert!(info.validate().is_err());
        info.queue = Some(vec![QueueItem { title: "a".into(), artists: vec![] }; MAX_QUEUE + 1]);
        assert!(info.validate().is_err());
    }

    #[test]
    fn reads_reports_without_the_optional_fields() {
        let json = r#"{"trackId":"t","title":"T","artists":[],"album":"A","artworkUrl":null,"durationMs":1,"positionMs":0,"paused":true}"#;
        let info: PlaybackInfo = serde_json::from_str(json).unwrap();
        assert_eq!((info.shuffle, info.repeat, info.volume), (None, None, None));
        let with: PlaybackInfo = serde_json::from_str(&json.replace("}", r#","repeat":"context","shuffle":true}"#)).unwrap();
        assert_eq!((with.shuffle, with.repeat), (Some(true), Some(RepeatMode::Context)));
    }
}
