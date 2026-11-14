//! Discord Rich Presence ("Listening to …") on a background thread. Updates only when the
//! track, pause state or position meaningfully change, and reconnects if Discord starts later.
use crate::playback::PlaybackInfo;
use discord_rich_presence::activity::{Activity, ActivityType, Assets, StatusDisplayType, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Baked in from .env.local at build time; presence stays off without it.
pub const APP_ID: Option<&str> = option_env!("CARBON_DISCORD_APP_ID");
const RETRY: Duration = Duration::from_secs(20);
const SEEK_TOLERANCE_MS: i64 = 3_000;
const MAX_TEXT: usize = 128;

pub enum Msg {
    Playback(Option<PlaybackInfo>),
    Enabled(bool),
}

pub struct Discord(Sender<Msg>);

impl Discord {
    pub fn spawn(enabled: bool) -> Self {
        let (tx, rx) = mpsc::channel();
        if let Some(app_id) = APP_ID {
            std::thread::spawn(move || run(app_id, enabled, rx));
        }
        Self(tx)
    }

    pub fn send(&self, msg: Msg) {
        let _ = self.0.send(msg); // worker absent when unconfigured; nothing to deliver
    }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Discord rejects fields shorter than 2 or longer than 128 characters.
fn field(text: &str) -> String {
    let mut out: String = text.chars().take(MAX_TEXT).collect();
    while out.chars().count() < 2 {
        out.push(' ');
    }
    out
}

#[derive(PartialEq, Debug, Clone)]
struct Shown {
    track_id: String,
    start_ms: i64,
}

/// What Discord should show, or None to clear it (paused, stopped or disabled).
fn target(info: Option<&PlaybackInfo>, enabled: bool, now: i64) -> Option<Shown> {
    let info = info.filter(|i| enabled && !i.paused)?;
    Some(Shown { track_id: info.track_id.clone(), start_ms: now - info.position_ms as i64 })
}

fn same(a: &Option<Shown>, b: &Option<Shown>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => a.track_id == b.track_id && (a.start_ms - b.start_ms).abs() <= SEEK_TOLERANCE_MS,
        _ => false,
    }
}

fn activity(info: &PlaybackInfo, start_ms: i64) -> Activity<'static> {
    let mut assets = Assets::new().large_text(field(&info.album));
    if let Some(url) = &info.artwork_url {
        assets = assets.large_image(url.clone());
    }
    // No length (a live radio station) means no end: Discord then shows time elapsed, not a full bar.
    let started = Timestamps::new().start(start_ms);
    let timestamps = if info.duration_ms > 0 { started.end(start_ms + info.duration_ms as i64) } else { started };
    Activity::new()
        .activity_type(ActivityType::Listening)
        .status_display_type(StatusDisplayType::Details)
        .details(field(&info.title))
        .state(field(&info.artist_line()))
        .assets(assets)
        .timestamps(timestamps)
}

fn run(app_id: &'static str, mut enabled: bool, rx: Receiver<Msg>) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut latest: Option<PlaybackInfo> = None;
    let mut shown: Option<Shown> = None;
    loop {
        match rx.recv_timeout(RETRY) {
            Ok(Msg::Playback(info)) => latest = info,
            Ok(Msg::Enabled(on)) => enabled = on,
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        let want = target(latest.as_ref(), enabled, now_ms());
        if same(&want, &shown) && (client.is_some() || want.is_none()) {
            continue;
        }
        if client.is_none() {
            let mut fresh = DiscordIpcClient::new(app_id);
            if fresh.connect().is_err() {
                continue; // Discord isn't running; retry on the next message or timeout
            }
            client = Some(fresh);
        }
        let Some(ipc) = client.as_mut() else { continue };
        let result = match (&want, latest.as_ref()) {
            (Some(s), Some(info)) => ipc.set_activity(activity(info, s.start_ms)),
            _ => ipc.clear_activity(),
        };
        match result {
            Ok(()) => shown = want,
            Err(e) => {
                eprintln!("[discord] presence update failed, reconnecting: {e}");
                let _ = ipc.close();
                client = None;
                shown = None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::sample;

    #[test]
    fn clears_when_paused_or_disabled() {
        assert_eq!(target(Some(&sample("t", 200_000, 1_000, true)), true, 10_000), None);
        assert_eq!(target(Some(&sample("t", 200_000, 1_000, false)), false, 10_000), None);
        assert_eq!(target(None, true, 10_000), None);
    }

    #[test]
    fn start_time_is_now_minus_position() {
        let shown = target(Some(&sample("t", 200_000, 4_000, false)), true, 10_000).unwrap();
        assert_eq!(shown.start_ms, 6_000);
    }

    #[test]
    fn ignores_small_drift_but_not_seeks_or_track_changes() {
        let a = Some(Shown { track_id: "t".into(), start_ms: 1_000 });
        assert!(same(&a, &Some(Shown { track_id: "t".into(), start_ms: 2_500 })));
        assert!(!same(&a, &Some(Shown { track_id: "t".into(), start_ms: 30_000 })));
        assert!(!same(&a, &Some(Shown { track_id: "u".into(), start_ms: 1_000 })));
        assert!(!same(&a, &None));
    }

    #[test]
    fn pads_and_trims_fields() {
        assert_eq!(field("A"), "A ");
        assert_eq!(field(&"x".repeat(300)).chars().count(), MAX_TEXT);
    }
}
