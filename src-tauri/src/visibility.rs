//! YouTube doesn't allow its player to play while it isn't on screen. Hiding or minimizing Carbon during
//! YouTube Music playback hands over to the always-on-top mini player instead (the webview does that).
use crate::playback::{PlaybackInfo, Source};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Window};

/// Payload: "close" (close to tray) or "minimize".
pub const EVENT: &str = "youtube-stays-visible";

#[derive(Default)]
pub struct YoutubePlaying(AtomicBool);

impl YoutubePlaying {
    pub fn update(&self, info: Option<&PlaybackInfo>) {
        self.0.store(must_stay_visible(info), Ordering::Relaxed);
    }

    pub fn get(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

fn must_stay_visible(info: Option<&PlaybackInfo>) -> bool {
    info.is_some_and(|i| !i.paused && i.source == Some(Source::Youtube))
}

/// Tells the main window it shouldn't vanish while YouTube plays.
pub fn hand_over(window: &Window, reason: &str) {
    if let Err(e) = window.emit(EVENT, reason) {
        eprintln!("[visibility] couldn't reach the window: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::sample;

    fn with(source: Option<Source>, paused: bool) -> PlaybackInfo {
        PlaybackInfo { source, ..sample("t", 1000, 0, paused) }
    }

    #[test]
    fn only_playing_youtube_must_stay_visible() {
        assert!(must_stay_visible(Some(&with(Some(Source::Youtube), false))));
        assert!(!must_stay_visible(Some(&with(Some(Source::Youtube), true))));
        assert!(!must_stay_visible(Some(&with(Some(Source::Spotify), false))));
        assert!(!must_stay_visible(Some(&with(Some(Source::Local), false))));
        assert!(!must_stay_visible(Some(&with(None, false))));
        assert!(!must_stay_visible(None));
    }
}
