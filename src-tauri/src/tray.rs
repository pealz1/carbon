//! System tray icon: what's playing, transport controls, show and quit.
use crate::media_controls::{emit, MediaCommand};
use crate::playback::PlaybackInfo;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

const TRAY_ID: &str = "carbon";
const MAX_LABEL: usize = 60; // Windows truncates tray tooltips at 128 chars

pub struct TrayState {
    now: MenuItem<Wry>,
    toggle: MenuItem<Wry>,
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<TrayState> {
    let item = |id: &str, text: &str, enabled: bool| MenuItem::with_id(app, id, text, enabled, None::<&str>);
    let now = item("now", "Nothing playing", false)?;
    let toggle = item("toggle", "Play", true)?;
    let menu = Menu::with_items(
        app,
        &[
            &now,
            &PredefinedMenuItem::separator(app)?,
            &toggle,
            &item("next", "Next", true)?,
            &item("previous", "Previous", true)?,
            &PredefinedMenuItem::separator(app)?,
            &item("show", "Show Carbon", true)?,
            &item("quit", "Quit Carbon", true)?,
        ],
    )?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Carbon")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => emit(app, MediaCommand::Toggle),
            "next" => emit(app, MediaCommand::Next),
            "previous" => emit(app, MediaCommand::Previous),
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(TrayState { now, toggle })
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    format!("{}…", text.chars().take(max - 1).collect::<String>())
}

impl TrayState {
    pub fn update(&self, app: &AppHandle, info: Option<&PlaybackInfo>) {
        let label = info.map_or_else(|| "Nothing playing".to_string(), |i| truncate(&format!("{} · {}", i.title, i.artist_line()), MAX_LABEL));
        let _ = self.now.set_text(&label);
        let _ = self.toggle.set_text(if info.is_some_and(|i| !i.paused) { "Pause" } else { "Play" });
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let _ = tray.set_tooltip(Some(format!("Carbon\n{label}")));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::truncate;

    #[test]
    fn truncates_long_labels_on_char_boundaries() {
        assert_eq!(truncate("short", 10), "short");
        assert_eq!(truncate("ééééééééééé", 5), "éééé…");
    }
}
