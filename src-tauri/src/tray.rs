//! System tray icon: what's playing, transport controls, show and quit.
use crate::media_controls::{emit, MediaCommand};
use crate::playback::PlaybackInfo;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

const TRAY_ID: &str = "carbon";
const MAX_LABEL: usize = 60; // Windows truncates tray tooltips at 128 chars

/// Pixel-fitted tray icons (brand/tray) by display scale: Windows draws the tray at 16 px x scale.
static TRAY_ICONS: [(f64, &[u8]); 4] = [
    (1.0, include_bytes!("../icons/tray-16.png")),
    (1.25, include_bytes!("../icons/tray-20.png")),
    (1.5, include_bytes!("../icons/tray-24.png")),
    (2.0, include_bytes!("../icons/tray-32.png")),
];

/// The smallest icon that covers the scale, so Windows only ever scales down.
fn tray_png(scale: f64) -> &'static [u8] {
    TRAY_ICONS.iter().find(|(s, _)| scale <= s + 0.01).unwrap_or(&TRAY_ICONS[3]).1
}

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

/// The show/hide shortcut: brings Carbon forward, or puts it in the tray when it's already in front.
pub fn toggle_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main").map(|w| w.as_ref().window()) else { return };
    let in_front = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) && window.is_focused().unwrap_or(false);
    if !in_front {
        return show_main(app);
    }
    // Like closing to the tray: playing YouTube needs the window kept alive (see visibility.rs).
    if app.state::<crate::visibility::YoutubePlaying>().get() {
        crate::visibility::hand_over(&window, "close");
    } else if let Err(e) = window.hide() {
        eprintln!("[tray] couldn't hide Carbon: {e}");
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
            &item("mini", "Mini player", true)?,
            &item("show", "Show Carbon", true)?,
            &item("quit", "Quit Carbon", true)?,
        ],
    )?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Carbon")
        .menu(&menu)
        .icon_as_template(cfg!(target_os = "macos"))
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => emit(app, MediaCommand::Toggle),
            "next" => emit(app, MediaCommand::Next),
            "previous" => emit(app, MediaCommand::Previous),
            "show" => show_main(app),
            // The mini player lives in the main window's interface, same as its global shortcut.
            "mini" => {
                if let Err(e) = app.emit_to("main", "global-hotkey", crate::hotkeys::Action::MiniPlayer) {
                    eprintln!("[tray] {e}");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if !cfg!(target_os = "macos") && let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    let scale = app.get_webview_window("main").and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
    match Image::from_bytes(tray_png(scale)) {
        Ok(icon) => builder = builder.icon(icon),
        Err(e) => {
            eprintln!("[tray] couldn't load the tray icon, using the app icon: {e}");
            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone());
            }
        }
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
    use super::{tray_png, truncate, TRAY_ICONS};

    #[test]
    fn truncates_long_labels_on_char_boundaries() {
        assert_eq!(truncate("short", 10), "short");
        assert_eq!(truncate("ééééééééééé", 5), "éééé…");
    }

    #[test]
    fn picks_the_tray_icon_for_the_display_scale() {
        let index = |scale| TRAY_ICONS.iter().position(|(_, png)| std::ptr::eq(*png, tray_png(scale)));
        assert_eq!(index(1.0), Some(0));
        assert_eq!(index(1.25), Some(1));
        assert_eq!(index(1.5), Some(2));
        assert_eq!(index(1.75), Some(3));
        assert_eq!(index(3.0), Some(3));
    }
}
