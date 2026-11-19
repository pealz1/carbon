use crate::{
    media_controls::{MediaCommand, emit},
    playback::PlaybackInfo,
};
use std::{
    ffi::{CString, c_char, c_void},
    sync::OnceLock,
};
use tauri::{AppHandle, WebviewWindow};
static APP: OnceLock<AppHandle> = OnceLock::new();
unsafe extern "C" {
    fn carbon_touch_install(window: *mut c_void, control: extern "C" fn(i32, f64));
    fn carbon_touch_update(title: *const c_char, playing: bool, position: f64, duration: f64);
}
extern "C" fn command(which: i32, value: f64) {
    let event = match which {
        0 => MediaCommand::Previous,
        1 => MediaCommand::Toggle,
        2 => MediaCommand::Next,
        3 if value.is_finite() && value >= 0.0 => MediaCommand::Seek { position_ms: value as u64 },
        _ => return,
    };
    if let Some(app) = APP.get() {
        emit(app, event);
    }
}
pub fn install(app: &AppHandle, window: &WebviewWindow) {
    let _ = APP.set(app.clone());
    let w = window.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(raw) = w.ns_window() {
            // The Tauri main-thread callback keeps the NSWindow alive through installation.
            unsafe {
                carbon_touch_install(raw, command);
            }
        }
    });
}
pub fn update(info: Option<&PlaybackInfo>) {
    let title = info.map_or_else(|| "Carbon".into(), |i| format!("{} · {}", i.title, i.artist_line()));
    let title = CString::new(title).unwrap_or_default();
    let (playing, pos, duration) = info.map_or((false, 0, 0), |i| (!i.paused, i.position_ms, i.duration_ms));
    // AppKit copies the title before scheduling its UI update.
    unsafe {
        carbon_touch_update(title.as_ptr(), playing, pos as f64, duration as f64);
    }
}
