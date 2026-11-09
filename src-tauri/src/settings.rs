//! User preferences, owned by Rust and persisted as JSON in the app config directory.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

const FILE: &str = "settings.json";
pub const ACCENTS: [&str; 6] = ["periwinkle", "ember", "mint", "rose", "gold", "ice"];

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Effects {
    Full,
    Balanced,
    Minimal,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub close_to_tray: bool,
    pub discord_presence: bool,
    pub lastfm_scrobbling: bool,
    pub effects: Effects,
    pub accent: String,
    pub lyrics_scale: f32,
    /// The listener's own Spotify app (Spotify caps each Client ID at 5 users). Empty = built-in.
    pub spotify_client_id: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            discord_presence: true,
            lastfm_scrobbling: true,
            effects: Effects::Full,
            accent: ACCENTS[0].into(),
            lyrics_scale: 1.0,
            spotify_client_id: String::new(),
        }
    }
}

/// Spotify Client IDs are 32 lowercase hex characters.
pub fn is_client_id(id: &str) -> bool {
    id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

impl Settings {
    /// Rejects values the UI can't render instead of silently storing them.
    pub fn validate(&self) -> Result<(), String> {
        if !ACCENTS.contains(&self.accent.as_str()) {
            return Err(format!("unknown accent '{}'", self.accent));
        }
        if !(0.75..=1.5).contains(&self.lyrics_scale) {
            return Err("lyrics size must be between 75% and 150%".into());
        }
        if !self.spotify_client_id.is_empty() && !is_client_id(&self.spotify_client_id) {
            return Err("that doesn't look like a Spotify Client ID (32 letters and numbers)".into());
        }
        Ok(())
    }
}

pub struct SettingsState(pub Mutex<Settings>);

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(FILE))
}

/// Loads saved settings; a missing or corrupt file falls back to defaults (and says so).
pub fn load(app: &AppHandle) -> Settings {
    let Ok(file) = path(app) else { return Settings::default() };
    match fs::read_to_string(&file) {
        Ok(text) => serde_json::from_str::<Settings>(&text)
            .ok()
            .filter(|s| s.validate().is_ok())
            .unwrap_or_else(|| {
                eprintln!("[settings] {} is invalid, using defaults", file.display());
                Settings::default()
            }),
        Err(_) => Settings::default(),
    }
}

fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let file = path(app)?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("could not create settings folder: {e}"))?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&file, text).map_err(|e| format!("could not save settings: {e}"))
}

pub fn current(app: &AppHandle) -> Settings {
    app.state::<SettingsState>().0.lock().map(|s| s.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn settings_get(state: State<SettingsState>) -> Result<Settings, String> {
    state.0.lock().map(|s| s.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_set(app: AppHandle, state: State<SettingsState>, settings: Settings) -> Result<Settings, String> {
    settings.validate()?;
    save(&app, &settings)?;
    *state.0.lock().map_err(|e| e.to_string())? = settings.clone();
    if let Some(discord) = app.try_state::<crate::discord::Discord>() {
        discord.send(crate::discord::Msg::Enabled(settings.discord_presence));
    }
    if let Some(lastfm) = app.try_state::<crate::lastfm::Lastfm>() {
        lastfm.send(crate::lastfm::Msg::Enabled(settings.lastfm_scrobbling));
    }
    let _ = app.emit("settings-changed", &settings);
    Ok(settings)
}

/// Removes the settings file (used by "remove saved data").
pub fn delete(app: &AppHandle) -> Result<(), String> {
    match fs::remove_file(path(app)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("could not remove settings: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        assert!(Settings::default().validate().is_ok());
    }

    #[test]
    fn rejects_bad_values() {
        let bad_accent = Settings { accent: "neon".into(), ..Settings::default() };
        assert!(bad_accent.validate().is_err());
        let bad_scale = Settings { lyrics_scale: 3.0, ..Settings::default() };
        assert!(bad_scale.validate().is_err());
        let bad_id = Settings { spotify_client_id: "not-an-id".into(), ..Settings::default() };
        assert!(bad_id.validate().is_err());
    }

    #[test]
    fn recognises_client_ids() {
        assert!(is_client_id("0123456789abcdef0123456789abcdef"));
        assert!(!is_client_id("0123456789ABCDEF0123456789ABCDEF"));
        assert!(!is_client_id("4bc83bfe"));
    }

    #[test]
    fn fills_missing_fields_from_defaults() {
        let parsed: Settings = serde_json::from_str(r#"{"closeToTray":false,"effects":"minimal"}"#).unwrap();
        assert!(!parsed.close_to_tray);
        assert_eq!(parsed.effects, Effects::Minimal);
        assert_eq!(parsed.accent, "periwinkle");
    }
}
