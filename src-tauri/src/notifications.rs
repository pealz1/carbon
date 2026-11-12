//! Song notifications (Settings → Desktop): a silent Windows toast with the artwork, song, artists
//! and where it's playing from, when the song changes while no Carbon window is focused.
use crate::playback::PlaybackInfo;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Skipping through songs only announces the one that stays.
const SETTLE: Duration = Duration::from_millis(1500);
const ART_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_ART_BYTES: usize = 2 * 1024 * 1024;
/// Artwork files rotate so a toast still on screen keeps its own picture.
const ART_SLOTS: u64 = 4;

#[derive(Default)]
pub struct Notifier {
    /// The song of the last report, None until the first one since Carbon started.
    last: Mutex<Option<String>>,
    latest: Mutex<Option<PlaybackInfo>>,
    generation: AtomicU64,
}

/// A different song than the last report. The first report after starting (restoring where
/// playback was) isn't news.
pub fn is_new_song(previous: Option<&str>, info: &PlaybackInfo) -> bool {
    previous.is_some_and(|p| p != info.track_id)
}

/// Once the song has settled: still that song, playing, wanted, and Carbon in the background.
pub fn should_show(enabled: bool, focused: bool, scheduled: &str, latest: Option<&PlaybackInfo>) -> bool {
    enabled && !focused && latest.is_some_and(|i| i.track_id == scheduled && !i.paused)
}

impl Notifier {
    pub fn update(&self, app: &AppHandle, info: Option<&PlaybackInfo>) {
        if let Ok(mut latest) = self.latest.lock() {
            latest.clone_from(&info.cloned());
        }
        let Some(info) = info else { return };
        let Ok(mut last) = self.last.lock() else { return };
        let new = is_new_song(last.as_deref(), info);
        *last = Some(info.track_id.clone());
        if !new || !crate::settings::current(app).track_notifications {
            return;
        }
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let (app, track_id) = (app.clone(), info.track_id.clone());
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(SETTLE).await;
            let notifier = app.state::<Notifier>();
            if notifier.generation.load(Ordering::SeqCst) != generation {
                return;
            }
            let latest = notifier.latest.lock().ok().and_then(|l| l.clone());
            if !should_show(crate::settings::current(&app).track_notifications, focused(&app), &track_id, latest.as_ref()) {
                return;
            }
            let Some(info) = latest else { return };
            let art = match &info.artwork_url {
                Some(url) => fetch_art(&app, url, generation % ART_SLOTS).await.map_err(|e| eprintln!("[notifications] artwork: {e}")).ok(),
                None => None,
            };
            show(&app, &info, art.as_deref());
        });
    }
}

fn focused(app: &AppHandle) -> bool {
    app.webview_windows().values().any(|w| w.is_focused().unwrap_or(false))
}

/// Toasts take local files only, so the (already https-checked) artwork is saved to the cache.
async fn fetch_art(app: &AppHandle, url: &str, slot: u64) -> Result<PathBuf, String> {
    let client = reqwest::Client::builder().timeout(ART_TIMEOUT).build().map_err(|e| e.to_string())?;
    let response = client.get(url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
    let extension = match response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()) {
        Some(t) if t.starts_with("image/png") => "png",
        Some(t) if t.starts_with("image/webp") => "webp",
        Some(t) if t.starts_with("image/") => "jpg",
        other => return Err(format!("not an image ({other:?})")),
    };
    if response.content_length().is_some_and(|n| n > MAX_ART_BYTES as u64) {
        return Err("artwork too large".into());
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_ART_BYTES {
        return Err("artwork too large".into());
    }
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("notifications");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("art-{slot}.{extension}"));
    std::fs::write(&file, &bytes).map_err(|e| e.to_string())?;
    Ok(file)
}

/// Dev builds have no Start menu entry for Windows to show toasts under, so they borrow
/// PowerShell's (the same rule tauri-plugin-notification uses).
#[cfg(windows)]
fn app_id(app: &AppHandle) -> String {
    let dev = std::env::current_exe().ok().and_then(|exe| exe.parent().map(|d| d.ends_with("target/debug") || d.ends_with("target/release"))).unwrap_or(true);
    if dev { tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string() } else { app.config().identifier.clone() }
}

#[cfg(windows)]
fn show(app: &AppHandle, info: &PlaybackInfo, art: Option<&Path>) {
    use tauri_winrt_notification::{IconCrop, Toast};
    let source = info.source.map(|s| s.label()).unwrap_or_default();
    let handle = app.clone();
    // Silent: a chime would play over the music.
    let mut toast = Toast::new(&app_id(app)).title(&info.title).text1(&info.artist_line()).text2(source).sound(None).on_activated(move |_| {
        crate::tray::show_main(&handle);
        Ok(())
    });
    if let Some(art) = art {
        toast = toast.icon(art, IconCrop::Square, &info.album);
    }
    if let Err(e) = toast.show() {
        eprintln!("[notifications] {e}");
    }
}

#[cfg(not(windows))]
fn show(_app: &AppHandle, _info: &PlaybackInfo, _art: Option<&Path>) {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::sample;

    #[test]
    fn announces_only_a_change_of_song() {
        let song = sample("t2", 200_000, 0, false);
        assert!(is_new_song(Some("t1"), &song));
        assert!(!is_new_song(Some("t2"), &song)); // pause, seek, resume
        assert!(!is_new_song(None, &song)); // restored at start
    }

    #[test]
    fn shows_only_for_the_settled_song_while_carbon_is_in_the_background() {
        let playing = sample("t2", 200_000, 1_000, false);
        assert!(should_show(true, false, "t2", Some(&playing)));
        assert!(!should_show(false, false, "t2", Some(&playing)));
        assert!(!should_show(true, true, "t2", Some(&playing)));
        assert!(!should_show(true, false, "t1", Some(&playing))); // skipped on since
        assert!(!should_show(true, false, "t2", Some(&sample("t2", 200_000, 1_000, true))));
        assert!(!should_show(true, false, "t2", None));
    }
}
