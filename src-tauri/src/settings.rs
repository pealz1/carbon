//! User preferences, owned by Rust and persisted as JSON in the app config directory.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

const FILE: &str = "settings.json";
pub const ACCENTS: [&str; 7] = ["yellow", "periwinkle", "ember", "mint", "rose", "gold", "ice"];

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Effects {
    Full,
    Balanced,
    Minimal,
}

/// How cinema mode lays out the screen (Settings → Cinema mode, or its bar).
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum CinemaLayout {
    /// Cover beside the lyrics.
    Split,
    /// Lyrics alone, centred.
    Lyrics,
    /// The cover alone, large.
    Cover,
    /// Just the wallpaper and a small caption.
    Ambient,
}

/// Where a lyric line's romanisation goes (Settings → Lyrics).
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum RomanPlace {
    Below,
    Instead,
}

/// Which Chinese characters lyrics are shown in.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum ChineseScript {
    Original,
    Simplified,
    Traditional,
}

/// The music services the listener connected (asked on first run, changeable in Settings).
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct Services {
    pub spotify: bool,
    pub youtube: bool,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// None until the listener has chosen.
    pub services: Option<Services>,
    pub close_to_tray: bool,
    pub discord_presence: bool,
    pub lastfm_scrobbling: bool,
    /// Sends listens to ListenBrainz once a token is saved; independent of Last.fm.
    pub listenbrainz_scrobbling: bool,
    pub effects: Effects,
    pub accent: String,
    pub lyrics_scale: f32,
    /// Lines away from the sung one are softly blurred; off keeps every line sharp.
    pub lyrics_blur: bool,
    pub cinema_layout: CinemaLayout,
    /// Romanised Japanese, Chinese and Korean lyrics by default; each song can override it.
    pub lyrics_romanise: bool,
    pub lyrics_roman_place: RomanPlace,
    /// Readings over kanji while romanisation is on.
    pub lyrics_furigana: bool,
    pub lyrics_chinese: ChineseScript,
    /// The listener's own Spotify app (Spotify caps each Client ID at 5 users). Empty = built-in.
    pub spotify_client_id: String,
    /// Phone remote / SDK server (Settings → Remote). Off unless the listener turns it on.
    pub remote_enabled: bool,
    pub remote_port: u16,
    /// Font families (Settings → Appearance). Empty = Carbon's own Segoe UI Variable fonts.
    pub font_text: String,
    pub font_display: String,
    pub font_lyrics: String,
    /// Interface sounds (Settings → Appearance). Never heard over Spotify's audio; the UI gates that.
    pub ui_sounds: bool,
    /// 0 to 1; 0.5 peaks around -24 dBFS.
    pub ui_sound_volume: f32,
    /// Carbon shuffles lists it can read itself, spacing out artists (Settings → Playback).
    pub smart_shuffle: bool,
    /// Brand updates already applied to this file (see `migrate`). Missing in older files, so 0.
    #[serde(default)]
    pub brand_version: u8,
    /// A Windows notification when the song changes while Carbon isn't focused.
    pub track_notifications: bool,
    /// Shortcuts that work from any app (Settings → Global shortcuts).
    pub hotkeys: crate::hotkeys::Hotkeys,
}

/// 1: the yellow rebrand.
const BRAND_VERSION: u8 = 1;

impl Default for Settings {
    fn default() -> Self {
        Self {
            services: None,
            close_to_tray: true,
            discord_presence: true,
            lastfm_scrobbling: true,
            listenbrainz_scrobbling: true,
            effects: Effects::Full,
            accent: ACCENTS[0].into(),
            lyrics_scale: 1.0,
            lyrics_blur: true,
            cinema_layout: CinemaLayout::Split,
            lyrics_romanise: false,
            lyrics_roman_place: RomanPlace::Below,
            lyrics_furigana: false,
            lyrics_chinese: ChineseScript::Original,
            spotify_client_id: String::new(),
            remote_enabled: false,
            remote_port: crate::remote::DEFAULT_PORT,
            font_text: String::new(),
            font_display: String::new(),
            font_lyrics: String::new(),
            ui_sounds: true,
            ui_sound_volume: 0.5,
            smart_shuffle: false,
            brand_version: BRAND_VERSION,
            track_notifications: false,
            hotkeys: crate::hotkeys::Hotkeys::default(),
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
        if !(0.0..=1.0).contains(&self.ui_sound_volume) {
            return Err("interface sound volume must be between 0% and 100%".into());
        }
        if self.remote_port < 1024 {
            return Err("the remote port must be between 1024 and 65535".into());
        }
        if self.services.is_some_and(|s| !s.spotify && !s.youtube) {
            return Err("connect at least one music service".into());
        }
        // Font names go into CSS, so anything but a plain family name is refused.
        if let Some(bad) = self.fonts().into_iter().find(|f| !f.is_empty() && !crate::fonts::is_safe_name(f)) {
            return Err(format!("\u{201c}{bad}\u{201d} isn't a font name Carbon can use"));
        }
        self.hotkeys.validate()
    }

    /// Periwinkle was everyone's saved default before the yellow rebrand, so it moves to yellow once.
    /// Picking periwinkle again afterwards sticks, because saving writes the new brand version.
    fn migrate(mut self) -> Self {
        if self.brand_version < BRAND_VERSION {
            if self.accent == "periwinkle" {
                self.accent = ACCENTS[0].into();
            }
            self.brand_version = BRAND_VERSION;
        }
        self
    }

    fn fonts(&self) -> [&str; 3] {
        [&self.font_text, &self.font_display, &self.font_lyrics]
    }

    /// Newly picked fonts must be installed. One picked earlier and uninstalled since stays (CSS
    /// falls back to Carbon's fonts), so unrelated changes still save. `installed` is only called
    /// when a font changed.
    pub fn check_new_fonts(&self, before: &Settings, installed: impl FnOnce() -> Result<Vec<String>, String>) -> Result<(), String> {
        let picked: Vec<&str> = self.fonts().into_iter().zip(before.fonts()).filter(|(now, was)| !now.is_empty() && now != was).map(|(now, _)| now).collect();
        if picked.is_empty() {
            return Ok(());
        }
        let installed = installed()?;
        match picked.into_iter().find(|f| !installed.iter().any(|i| i == f)) {
            Some(missing) => Err(format!("the font \u{201c}{missing}\u{201d} isn't installed")),
            None => Ok(()),
        }
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
            .map(|s| Settings { hotkeys: s.hotkeys.clone().sanitized(), ..s })
            .filter(|s| s.validate().is_ok())
            .map(Settings::migrate)
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
    let before = state.0.lock().map_err(|e| e.to_string())?.clone();
    settings.check_new_fonts(&before, crate::fonts::installed)?;
    // Before saving, so a port that's in use doesn't get remembered as "on".
    if let Some(remote) = app.try_state::<crate::remote::Remote>() {
        remote.apply(settings.remote_enabled, settings.remote_port)?;
    }
    save(&app, &settings)?;
    *state.0.lock().map_err(|e| e.to_string())? = settings.clone();
    // After saving: a shortcut another app holds is reported per binding, not as a failed save.
    if settings.hotkeys != before.hotkeys {
        crate::hotkeys::apply(&app, &settings.hotkeys);
    }
    if let Some(discord) = app.try_state::<crate::discord::Discord>() {
        discord.send(crate::discord::Msg::Enabled(settings.discord_presence));
    }
    if let Some(lastfm) = app.try_state::<crate::lastfm::Lastfm>() {
        lastfm.send(crate::lastfm::Msg::Enabled(settings.lastfm_scrobbling));
    }
    if let Some(listenbrainz) = app.try_state::<crate::listenbrainz::Listenbrainz>() {
        listenbrainz.send(crate::listenbrainz::Msg::Enabled(settings.listenbrainz_scrobbling));
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
    fn moves_the_old_default_accent_to_yellow_once() {
        let old: Settings = serde_json::from_str(r#"{"accent":"periwinkle"}"#).unwrap();
        assert!(old.validate().is_ok());
        assert_eq!(old.migrate().accent, "yellow");
        let picked_mint: Settings = serde_json::from_str(r#"{"accent":"mint"}"#).unwrap();
        assert_eq!(picked_mint.migrate().accent, "mint");
        let picked_after: Settings = serde_json::from_str(r#"{"accent":"periwinkle","brandVersion":1}"#).unwrap();
        assert_eq!(picked_after.migrate().accent, "periwinkle");
    }

    #[test]
    fn rejects_bad_values() {
        let bad_accent = Settings { accent: "neon".into(), ..Settings::default() };
        assert!(bad_accent.validate().is_err());
        let bad_scale = Settings { lyrics_scale: 3.0, ..Settings::default() };
        assert!(bad_scale.validate().is_err());
        let bad_id = Settings { spotify_client_id: "not-an-id".into(), ..Settings::default() };
        assert!(bad_id.validate().is_err());
        let bad_port = Settings { remote_port: 80, ..Settings::default() };
        assert!(bad_port.validate().is_err());
        let no_service = Settings { services: Some(Services { spotify: false, youtube: false }), ..Settings::default() };
        assert!(no_service.validate().is_err());
        let youtube_only = Settings { services: Some(Services { spotify: false, youtube: true }), ..Settings::default() };
        assert!(youtube_only.validate().is_ok());
        let loud = Settings { ui_sound_volume: 1.5, ..Settings::default() };
        assert!(loud.validate().is_err());
        let negative = Settings { ui_sound_volume: -0.1, ..Settings::default() };
        assert!(negative.validate().is_err());
        let silent = Settings { ui_sound_volume: 0.0, ..Settings::default() };
        assert!(silent.validate().is_ok());
    }

    #[test]
    fn refuses_font_names_that_could_escape_css() {
        let ok = Settings { font_text: "Segoe UI".into(), font_lyrics: "Bahnschrift SemiBold".into(), ..Settings::default() };
        assert!(ok.validate().is_ok());
        let bad = Settings { font_display: "Arial\"; } * { display: none".into(), ..Settings::default() };
        assert!(bad.validate().is_err());
    }

    #[test]
    fn only_newly_picked_fonts_must_be_installed() {
        let installed = || Ok(vec!["Arial".to_string(), "Segoe UI".to_string()]);
        let unused = || -> Result<Vec<String>, String> { panic!("fonts listed without a font change") };
        let before = Settings { font_lyrics: "Uninstalled Since".into(), ..Settings::default() };

        let accent_change = Settings { accent: "mint".into(), ..before.clone() };
        assert!(accent_change.check_new_fonts(&before, unused).is_ok());
        let back_to_default = Settings { font_lyrics: String::new(), ..before.clone() };
        assert!(back_to_default.check_new_fonts(&before, unused).is_ok());

        let picked = Settings { font_text: "Arial".into(), ..before.clone() };
        assert!(picked.check_new_fonts(&before, installed).is_ok());
        let missing = Settings { font_display: "Comic Neue".into(), ..before.clone() };
        assert!(missing.check_new_fonts(&before, installed).unwrap_err().contains("Comic Neue"));
    }

    #[test]
    fn keeps_other_settings_when_a_saved_shortcut_is_unusable() {
        let parsed: Settings = serde_json::from_str(r#"{"accent":"mint","hotkeys":{"enabled":true,"next":"Q"}}"#).unwrap();
        assert!(parsed.validate().is_err());
        let clean = Settings { hotkeys: parsed.hotkeys.clone().sanitized(), ..parsed };
        assert!(clean.validate().is_ok());
        assert_eq!(clean.accent, "mint");
        assert!(clean.hotkeys.enabled);
        assert_eq!(clean.hotkeys.next, "");
        assert!(!Settings::default().track_notifications);
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
        assert_eq!(parsed.accent, "yellow");
        assert!(!parsed.remote_enabled);
        assert_eq!(parsed.remote_port, 10767);
        assert_eq!(parsed.services, None); // settings from before the service choice
        let chosen: Settings = serde_json::from_str(r#"{"services":{"spotify":false,"youtube":true}}"#).unwrap();
        assert_eq!(chosen.services, Some(Services { spotify: false, youtube: true }));
        assert_eq!(parsed.font_text, "");
        assert!(parsed.ui_sounds);
        assert!(parsed.listenbrainz_scrobbling);
        assert!(!parsed.lyrics_romanise);
        assert_eq!((parsed.lyrics_roman_place, parsed.lyrics_chinese), (RomanPlace::Below, ChineseScript::Original));
        let lyrics: Settings = serde_json::from_str(r#"{"lyricsRomanise":true,"lyricsRomanPlace":"instead","lyricsChinese":"traditional"}"#).unwrap();
        assert_eq!((lyrics.lyrics_romanise, lyrics.lyrics_roman_place, lyrics.lyrics_chinese), (true, RomanPlace::Instead, ChineseScript::Traditional));
        assert!(serde_json::from_str::<Settings>(r#"{"lyricsChinese":"klingon"}"#).is_err());
        assert_eq!(parsed.ui_sound_volume, 0.5);
        assert!(!parsed.smart_shuffle);
        assert!(parsed.lyrics_blur);
        assert_eq!(parsed.cinema_layout, CinemaLayout::Split);
    }

    #[test]
    fn reads_cinema_layouts_and_refuses_unknown_ones() {
        let lyrics: Settings = serde_json::from_str(r#"{"cinemaLayout":"lyrics","lyricsBlur":false}"#).unwrap();
        assert_eq!(lyrics.cinema_layout, CinemaLayout::Lyrics);
        assert!(!lyrics.lyrics_blur);
        assert!(serde_json::from_str::<Settings>(r#"{"cinemaLayout":"theatre"}"#).is_err());
    }
}
