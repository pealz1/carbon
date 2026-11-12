//! Global shortcuts: play/pause, next, previous, the mini player, the A-B loop and the sleep timer
//! from any app. Off until the listener turns them on (Settings → Desktop); each can be changed or
//! cleared. The loop and the sleep timer start unbound.
use crate::media_controls::{emit, MediaCommand};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState};

/// Bindings as accelerator strings ("Ctrl+Alt+Space"); empty means unbound.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Hotkeys {
    pub enabled: bool,
    pub play_pause: String,
    pub next: String,
    pub previous: String,
    pub mini_player: String,
    pub ab_loop: String,
    pub sleep_timer: String,
}

impl Default for Hotkeys {
    fn default() -> Self {
        Self {
            enabled: false,
            play_pause: "Ctrl+Alt+Space".into(),
            next: "Ctrl+Alt+Right".into(),
            previous: "Ctrl+Alt+Left".into(),
            mini_player: "Ctrl+Alt+M".into(),
            ab_loop: String::new(),
            sleep_timer: String::new(),
        }
    }
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    PlayPause,
    Next,
    Previous,
    MiniPlayer,
    AbLoop,
    SleepTimer,
}

const LONE_KEYS: [Code; 12] = [
    Code::F13,
    Code::F14,
    Code::F15,
    Code::F16,
    Code::F17,
    Code::F18,
    Code::F19,
    Code::F20,
    Code::F21,
    Code::F22,
    Code::F23,
    Code::F24,
];

/// A shortcut Carbon will take from every app: a key with Ctrl, Alt or Windows (Shift alone would
/// swallow typed capitals), or one of F13–F24, which nothing types.
pub fn parse(combo: &str) -> Result<Shortcut, String> {
    let shortcut = Shortcut::from_str(combo).map_err(|_| format!("\u{201c}{combo}\u{201d} isn't a shortcut Carbon understands"))?;
    let held = shortcut.mods.intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER);
    if !held && !LONE_KEYS.contains(&shortcut.key) {
        return Err(format!("\u{201c}{combo}\u{201d} needs Ctrl, Alt or the Windows key"));
    }
    Ok(shortcut)
}

impl Hotkeys {
    fn bindings(&self) -> [(Action, &str); 6] {
        [
            (Action::PlayPause, &self.play_pause),
            (Action::Next, &self.next),
            (Action::Previous, &self.previous),
            (Action::MiniPlayer, &self.mini_player),
            (Action::AbLoop, &self.ab_loop),
            (Action::SleepTimer, &self.sleep_timer),
        ]
    }

    pub fn validate(&self) -> Result<(), String> {
        let mut seen = HashSet::new();
        for (_, combo) in self.bindings().into_iter().filter(|(_, c)| !c.is_empty()) {
            if !seen.insert(parse(combo)?.id()) {
                return Err(format!("\u{201c}{combo}\u{201d} is set for two actions"));
            }
        }
        Ok(())
    }

    /// Clears bindings that can't be used (unreadable, or a repeat of an earlier one), so one bad
    /// binding in a saved file doesn't reset every other setting.
    pub fn sanitized(mut self) -> Self {
        let mut seen = HashSet::new();
        let slots = [&mut self.play_pause, &mut self.next, &mut self.previous, &mut self.mini_player, &mut self.ab_loop, &mut self.sleep_timer];
        for slot in slots {
            if !slot.is_empty() && !parse(slot).is_ok_and(|s| seen.insert(s.id())) {
                slot.clear();
            }
        }
        self
    }
}

/// How one binding fared when Carbon last applied them.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    action: Action,
    combo: String,
    registered: bool,
    error: Option<String>,
}

#[derive(Default)]
pub struct HotkeyState {
    registered: Mutex<Vec<(u32, Action)>>,
    status: Mutex<Vec<Status>>,
}

/// Registers the bindings (replacing the previous ones). Failures are reported per binding and
/// never stop the others or the settings save.
pub fn apply(app: &AppHandle, hotkeys: &Hotkeys) {
    let shortcuts = app.global_shortcut();
    if let Err(e) = shortcuts.unregister_all() {
        eprintln!("[hotkeys] couldn't release the old shortcuts: {e}");
    }
    let mut registered = Vec::new();
    let status = hotkeys
        .bindings()
        .into_iter()
        .map(|(action, combo)| {
            let mut status = Status { action, combo: combo.to_string(), registered: false, error: None };
            if !hotkeys.enabled || combo.is_empty() {
                return status;
            }
            match parse(combo).and_then(|s| shortcuts.register(s).map(|()| s).map_err(|e| taken(combo, &e.to_string()))) {
                Ok(shortcut) => {
                    registered.push((shortcut.id(), action));
                    status.registered = true;
                }
                Err(e) => status.error = Some(e),
            }
            status
        })
        .collect();
    let state = app.state::<HotkeyState>();
    if let (Ok(mut r), Ok(mut s)) = (state.registered.lock(), state.status.lock()) {
        *r = registered;
        *s = status;
    }
}

fn taken(combo: &str, detail: &str) -> String {
    eprintln!("[hotkeys] {combo}: {detail}");
    "Windows wouldn't give Carbon this shortcut. Another app is probably using it.".into()
}

/// The plugin's handler for every registered shortcut.
pub fn handle(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return; // each press also reports its release
    }
    let state = app.state::<HotkeyState>();
    let action = state.registered.lock().ok().and_then(|r| r.iter().find(|(id, _)| *id == shortcut.id()).map(|(_, a)| *a));
    match action {
        Some(Action::PlayPause) => emit(app, MediaCommand::Toggle),
        Some(Action::Next) => emit(app, MediaCommand::Next),
        Some(Action::Previous) => emit(app, MediaCommand::Previous),
        // The rest live in the main window's interface.
        Some(action) => {
            if let Err(e) = app.emit_to("main", "global-hotkey", action) {
                eprintln!("[hotkeys] {e}");
            }
        }
        None => {}
    }
}

/// While Settings records a new shortcut, Carbon's own shortcuts are let go: otherwise pressing one
/// would play or pause instead of reaching the recorder.
#[tauri::command]
pub fn hotkeys_suspend(app: AppHandle, suspended: bool) -> Result<(), String> {
    if suspended {
        return app.global_shortcut().unregister_all().map_err(|e| e.to_string());
    }
    apply(&app, &crate::settings::current(&app).hotkeys);
    Ok(())
}

#[tauri::command]
pub fn hotkeys_status(state: State<HotkeyState>) -> Vec<Status> {
    state.status.lock().map(|s| s.clone()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_off_and_valid() {
        let defaults = Hotkeys::default();
        assert!(!defaults.enabled);
        assert!(defaults.validate().is_ok());
        assert_eq!(defaults.clone().sanitized(), defaults);
    }

    #[test]
    fn takes_only_shortcuts_that_leave_typing_alone() {
        assert!(parse("Ctrl+Alt+Space").is_ok());
        assert!(parse("Super+Shift+P").is_ok());
        assert!(parse("F19").is_ok());
        assert!(parse("Shift+K").is_err());
        assert!(parse("K").is_err());
        assert!(parse("F5").is_err());
        assert!(parse("Ctrl+Alt+Banana").is_err());
        assert!(parse("Ctrl+").is_err());
    }

    #[test]
    fn refuses_one_shortcut_for_two_actions() {
        let twice = Hotkeys { next: "Alt+Ctrl+Space".into(), ..Hotkeys::default() };
        assert!(twice.validate().unwrap_err().contains("two actions"));
        let unbound = Hotkeys { next: String::new(), previous: String::new(), ..Hotkeys::default() };
        assert!(unbound.validate().is_ok());
    }

    #[test]
    fn clears_bad_bindings_instead_of_the_whole_file() {
        let saved = Hotkeys { enabled: true, next: "Ctrl+Alt+Space".into(), previous: "Q".into(), ..Hotkeys::default() };
        let clean = saved.sanitized();
        assert!(clean.enabled);
        assert_eq!(clean.play_pause, "Ctrl+Alt+Space");
        assert_eq!(clean.next, "");
        assert_eq!(clean.previous, "");
        assert_eq!(clean.mini_player, "Ctrl+Alt+M");
        assert_eq!(clean.ab_loop, "");
    }

    #[test]
    fn leaves_the_loop_and_sleep_timer_unbound_until_chosen() {
        let defaults = Hotkeys::default();
        assert_eq!((defaults.ab_loop.as_str(), defaults.sleep_timer.as_str()), ("", ""));
        let chosen = Hotkeys { ab_loop: "Ctrl+Alt+L".into(), sleep_timer: "Ctrl+Alt+S".into(), ..defaults };
        assert!(chosen.validate().is_ok());
        assert_eq!(serde_json::to_string(&Action::SleepTimer).unwrap(), r#""sleepTimer""#);
    }

    #[test]
    fn reads_bindings_from_settings_json() {
        let parsed: Hotkeys = serde_json::from_str(r#"{"enabled":true,"miniPlayer":""}"#).unwrap();
        assert!(parsed.enabled);
        assert_eq!(parsed.mini_player, "");
        assert_eq!(parsed.play_pause, "Ctrl+Alt+Space");
    }
}
