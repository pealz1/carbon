//! Small always-on-top windows: the mini player and the lyrics pop-out. They never play anything
//! themselves: the main window publishes what its player is doing over events, and their buttons
//! come back here to become the same `media-command`s the media keys send.
use crate::media_controls::{emit, MediaCommand};
use crate::playback::MAX_DURATION_MS;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Theme, WebviewUrl, WebviewWindowBuilder};

const MAIN: &str = "main";

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Popout {
    Mini,
    Lyrics,
}

struct Spec {
    label: &'static str,
    title: &'static str,
    route: &'static str,
    size: (f64, f64),
    min: (f64, f64),
}

impl Popout {
    const ALL: [Popout; 2] = [Popout::Mini, Popout::Lyrics];

    fn spec(self) -> Spec {
        match self {
            Popout::Mini => Spec { label: "mini", title: "Carbon mini player", route: "popout/mini", size: (360.0, 132.0), min: (300.0, 112.0) },
            Popout::Lyrics => Spec { label: "lyrics", title: "Carbon lyrics", route: "popout/lyrics", size: (360.0, 520.0), min: (260.0, 240.0) },
        }
    }

    pub fn is_label(label: &str) -> bool {
        Self::ALL.iter().any(|p| p.spec().label == label)
    }
}

/// Which pop-outs are open, for the main window's menus.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Open {
    mini: bool,
    lyrics: bool,
}

/// `closing` is a window that is being destroyed and may still be listed.
fn open_now(app: &AppHandle, closing: Option<&str>) -> Open {
    let has = |p: Popout| closing != Some(p.spec().label) && app.get_webview_window(p.spec().label).is_some();
    Open { mini: has(Popout::Mini), lyrics: has(Popout::Lyrics) }
}

/// Tells the main window which pop-outs are open (after one opens or is destroyed).
pub fn changed(app: &AppHandle, closing: Option<&str>) {
    if let Err(e) = app.emit_to(MAIN, "popouts-changed", open_now(app, closing)) {
        eprintln!("[popouts] {e}");
    }
}

/// A button in a pop-out. Validated here before it reaches the player like any media key.
#[derive(Deserialize, Clone, PartialEq, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PopoutCommand {
    Toggle,
    Next,
    Previous,
    Seek {
        #[serde(rename = "positionMs")]
        position_ms: u64,
    },
    ShowMain,
}

impl PopoutCommand {
    /// The player command, or None for window-only commands.
    fn media(&self) -> Result<Option<MediaCommand>, String> {
        Ok(Some(match self {
            Self::Toggle => MediaCommand::Toggle,
            Self::Next => MediaCommand::Next,
            Self::Previous => MediaCommand::Previous,
            Self::Seek { position_ms } if *position_ms <= MAX_DURATION_MS => MediaCommand::Seek { position_ms: *position_ms },
            Self::Seek { .. } => return Err("that position is out of range".into()),
            Self::ShowMain => return Ok(None),
        }))
    }
}

/// Async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn popout_open(app: AppHandle, kind: Popout) -> Result<(), String> {
    let spec = kind.spec();
    if let Some(window) = app.get_webview_window(spec.label) {
        return window.set_focus().map_err(|e| e.to_string());
    }
    // WebView2 refuses a second webview whose browser arguments differ from the first one's.
    let args = app.config().app.windows.iter().find(|w| w.label == MAIN).and_then(|w| w.additional_browser_args.clone());
    let mut builder = WebviewWindowBuilder::new(&app, spec.label, WebviewUrl::App(spec.route.into()))
        .title(spec.title)
        .inner_size(spec.size.0, spec.size.1)
        .min_inner_size(spec.min.0, spec.min.1)
        .always_on_top(true)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .theme(Some(Theme::Dark))
        .disable_drag_drop_handler()
        .visible(false);
    if let Some(args) = args {
        builder = builder.additional_browser_args(&args);
    }
    // The window-state plugin has put it back where it was (if that's still on a screen) by now.
    let window = builder.build().map_err(|e| format!("couldn't open the window: {e}"))?;
    window.show().map_err(|e| e.to_string())?;
    changed(&app, None);
    Ok(())
}

#[tauri::command]
pub fn popout_close(app: AppHandle, kind: Popout) -> Result<(), String> {
    match app.get_webview_window(kind.spec().label) {
        Some(window) => window.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[tauri::command]
pub fn popouts_open(app: AppHandle) -> Open {
    open_now(&app, None)
}

#[tauri::command]
pub fn popout_command(app: AppHandle, command: PopoutCommand) -> Result<(), String> {
    match command.media()? {
        Some(media) => emit(&app, media),
        None => crate::tray::show_main(&app),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_commands_from_the_popouts() {
        let parse = |json: &str| serde_json::from_str::<PopoutCommand>(json).unwrap();
        assert_eq!(parse(r#"{"kind":"toggle"}"#), PopoutCommand::Toggle);
        assert_eq!(parse(r#"{"kind":"seek","positionMs":4200}"#), PopoutCommand::Seek { position_ms: 4200 });
        assert_eq!(parse(r#"{"kind":"showMain"}"#), PopoutCommand::ShowMain);
        assert!(serde_json::from_str::<PopoutCommand>(r#"{"kind":"playUri","uri":"x"}"#).is_err());
        assert!(serde_json::from_str::<PopoutCommand>(r#"{"kind":"seek","positionMs":-1}"#).is_err());
    }

    #[test]
    fn turns_buttons_into_player_commands() {
        assert_eq!(PopoutCommand::Next.media(), Ok(Some(MediaCommand::Next)));
        assert_eq!(PopoutCommand::Seek { position_ms: 61_000 }.media(), Ok(Some(MediaCommand::Seek { position_ms: 61_000 })));
        assert!(PopoutCommand::Seek { position_ms: MAX_DURATION_MS + 1 }.media().is_err());
        assert_eq!(PopoutCommand::ShowMain.media(), Ok(None));
    }

    #[test]
    fn knows_its_window_labels() {
        assert!(Popout::is_label("mini"));
        assert!(Popout::is_label("lyrics"));
        assert!(!Popout::is_label("main"));
    }
}
