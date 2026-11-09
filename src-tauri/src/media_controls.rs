//! Windows System Media Transport Controls: the media flyout, lock screen and hardware media
//! keys. Button presses are forwarded to the webview player as `media-command` events.
use crate::playback::{PlaybackInfo, RepeatMode};
use serde::Serialize;
use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, WebviewWindow};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MediaCommand {
    Play,
    Pause,
    Toggle,
    Next,
    Previous,
    Seek {
        #[serde(rename = "positionMs")]
        position_ms: u64,
    },
    // From the phone remote (see remote::protocol for validation).
    Volume {
        value: f64,
    },
    Shuffle {
        on: bool,
    },
    Repeat {
        mode: RepeatMode,
    },
    PlayUri {
        uri: String,
    },
}

#[derive(Default)]
pub struct MediaState {
    controls: Mutex<Option<MediaControls>>,
    shown_track: Mutex<Option<String>>,
}

pub fn emit(app: &AppHandle, command: MediaCommand) {
    if let Err(e) = app.emit("media-command", command) {
        eprintln!("[media] could not forward command: {e}");
    }
}

fn to_command(event: MediaControlEvent) -> Option<MediaCommand> {
    Some(match event {
        MediaControlEvent::Play => MediaCommand::Play,
        MediaControlEvent::Pause => MediaCommand::Pause,
        MediaControlEvent::Toggle => MediaCommand::Toggle,
        MediaControlEvent::Next => MediaCommand::Next,
        MediaControlEvent::Previous => MediaCommand::Previous,
        MediaControlEvent::SetPosition(MediaPosition(at)) => MediaCommand::Seek { position_ms: at.as_millis() as u64 },
        _ => return None,
    })
}

impl MediaState {
    pub fn attach(&self, app: &AppHandle, window: &WebviewWindow) {
        let hwnd = match window.hwnd() {
            Ok(hwnd) => hwnd.0,
            Err(e) => return eprintln!("[media] no window handle: {e}"),
        };
        let config = PlatformConfig { display_name: "Carbon", dbus_name: "carbon", hwnd: Some(hwnd) };
        let mut controls = match MediaControls::new(config) {
            Ok(c) => c,
            Err(e) => return eprintln!("[media] media controls unavailable: {e:?}"),
        };
        let handle = app.clone();
        if let Err(e) = controls.attach(move |event| {
            if let Some(command) = to_command(event) {
                emit(&handle, command);
            }
        }) {
            return eprintln!("[media] could not listen for media keys: {e:?}");
        }
        if let Ok(mut slot) = self.controls.lock() {
            *slot = Some(controls);
        }
    }

    pub fn update(&self, info: Option<&PlaybackInfo>) {
        let (Ok(mut guard), Ok(mut shown)) = (self.controls.lock(), self.shown_track.lock()) else { return };
        let Some(controls) = guard.as_mut() else { return };
        let Some(info) = info else {
            *shown = None;
            let _ = controls.set_playback(MediaPlayback::Stopped);
            return;
        };
        if shown.as_deref() != Some(info.track_id.as_str()) {
            let artists = info.artist_line();
            let metadata = MediaMetadata {
                title: Some(&info.title),
                album: Some(&info.album),
                artist: Some(&artists),
                cover_url: info.artwork_url.as_deref(),
                duration: Some(Duration::from_millis(info.duration_ms)),
            };
            if let Err(e) = controls.set_metadata(metadata) {
                eprintln!("[media] metadata update failed: {e:?}");
            }
            *shown = Some(info.track_id.clone());
        }
        let progress = Some(MediaPosition(Duration::from_millis(info.position_ms)));
        let playback = if info.paused { MediaPlayback::Paused { progress } } else { MediaPlayback::Playing { progress } };
        if let Err(e) = controls.set_playback(playback) {
            eprintln!("[media] playback update failed: {e:?}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_os_events_to_player_commands() {
        assert_eq!(to_command(MediaControlEvent::Next), Some(MediaCommand::Next));
        assert_eq!(
            to_command(MediaControlEvent::SetPosition(MediaPosition(Duration::from_millis(61_500)))),
            Some(MediaCommand::Seek { position_ms: 61_500 })
        );
        assert_eq!(to_command(MediaControlEvent::Quit), None);
    }

    #[test]
    fn serialises_commands_for_the_webview() {
        let json = serde_json::to_string(&MediaCommand::Seek { position_ms: 5 }).unwrap();
        assert_eq!(json, r#"{"kind":"seek","positionMs":5}"#);
        assert_eq!(serde_json::to_string(&MediaCommand::Toggle).unwrap(), r#"{"kind":"toggle"}"#);
    }

    #[test]
    fn serialises_remote_commands_for_the_webview() {
        let json = |c: MediaCommand| serde_json::to_string(&c).unwrap();
        assert_eq!(json(MediaCommand::Volume { value: 0.5 }), r#"{"kind":"volume","value":0.5}"#);
        assert_eq!(json(MediaCommand::Shuffle { on: true }), r#"{"kind":"shuffle","on":true}"#);
        assert_eq!(json(MediaCommand::Repeat { mode: RepeatMode::Track }), r#"{"kind":"repeat","mode":"track"}"#);
        assert_eq!(
            json(MediaCommand::PlayUri { uri: "spotify:album:x".into() }),
            r#"{"kind":"playUri","uri":"spotify:album:x"}"#
        );
    }
}
