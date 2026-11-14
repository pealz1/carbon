//! Sound settings (EQ, normalization, compressor, crossfade, output device), persisted as sound.json in the
//! app config directory. Kept apart from settings.json so the two can evolve independently.
use super::crossfade;
use super::dsp::Snapshot;
use super::dsp::eq::{self, BANDS, Bands};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const FILE: &str = "sound.json";
const MAX_DEVICE_NAME: usize = 256;
pub const MAX_PREAMP_DB: f32 = 12.0;
pub const MAX_WIDTH: f32 = 2.0;

/// Which loudness tags to trust before measuring a file ourselves.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum TagGain {
    Off,
    #[default]
    Track,
    Album,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct SoundSettings {
    /// A preset id, or "custom" for the listener's own curve.
    pub preset: String,
    pub bands: Bands,
    /// The last hand-tuned curve, restored when "Custom" is picked again.
    pub custom_bands: Bands,
    pub preamp_db: f32,
    pub normalize: bool,
    /// ReplayGain / R128 tags to use for `normalize`; untagged files are always measured.
    pub tag_gain: TagGain,
    pub compressor: bool,
    /// 0 to 1; see dsp/compressor.rs for what it maps to.
    pub compressor_amount: f32,
    /// Skip long silence at the start and end of each file.
    pub skip_silence: bool,
    pub crossfade_secs: f32,
    pub width: f32,
    /// Output device name; empty follows the Windows default.
    pub device: String,
    /// Experimental EQ on Spotify's audio. Read once at startup (see spotify_eq.rs).
    pub spotify_eq: bool,
}

impl Default for SoundSettings {
    fn default() -> Self {
        SoundSettings {
            preset: "flat".into(),
            bands: [0.0; BANDS],
            custom_bands: [0.0; BANDS],
            preamp_db: 0.0,
            normalize: true,
            tag_gain: TagGain::Track,
            compressor: false,
            compressor_amount: 0.5,
            skip_silence: false,
            crossfade_secs: 0.0,
            width: 1.0,
            device: String::new(),
            spotify_eq: false,
        }
    }
}

impl SoundSettings {
    pub fn validate(&self) -> Result<(), String> {
        if self.preset != eq::CUSTOM && eq::preset(&self.preset).is_none() {
            return Err(format!("unknown EQ preset '{}'", self.preset));
        }
        if !self.bands.iter().chain(self.custom_bands.iter()).all(|g| eq::valid_gain(*g)) {
            return Err(format!("EQ bands must be between -{0} and +{0} dB", eq::MAX_GAIN_DB));
        }
        if !self.preamp_db.is_finite() || self.preamp_db.abs() > MAX_PREAMP_DB {
            return Err(format!("preamp must be between -{0} and +{0} dB", MAX_PREAMP_DB));
        }
        if !(0.0..=1.0).contains(&self.compressor_amount) {
            return Err("compressor amount must be between 0% and 100%".into());
        }
        if !(0.0..=crossfade::MAX_SECONDS).contains(&self.crossfade_secs) {
            return Err(format!("crossfade must be between 0 and {} seconds", crossfade::MAX_SECONDS));
        }
        if !(0.0..=MAX_WIDTH).contains(&self.width) {
            return Err("stereo width must be between 0% and 200%".into());
        }
        if self.device.len() > MAX_DEVICE_NAME || self.device.chars().any(char::is_control) {
            return Err("that output device name isn't valid".into());
        }
        Ok(())
    }

    pub fn dsp(&self, volume: f32) -> Snapshot {
        let compress = if self.compressor { self.compressor_amount } else { 0.0 };
        Snapshot { preamp_db: self.preamp_db, bands: self.bands, width: self.width, compress, volume }
    }
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join(FILE))
}

pub fn load(app: &AppHandle) -> SoundSettings {
    let Ok(file) = path(app) else { return SoundSettings::default() };
    let Ok(text) = fs::read_to_string(&file) else { return SoundSettings::default() };
    serde_json::from_str::<SoundSettings>(&text).ok().filter(|s| s.validate().is_ok()).unwrap_or_else(|| {
        eprintln!("[sound] {} is invalid, using defaults", file.display());
        SoundSettings::default()
    })
}

pub fn save(app: &AppHandle, settings: &SoundSettings) -> Result<(), String> {
    let file = path(app)?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("could not create settings folder: {e}"))?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&file, text).map_err(|e| format!("could not save sound settings: {e}"))
}

pub fn delete(app: &AppHandle) -> Result<(), String> {
    match fs::remove_file(path(app)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("could not remove sound settings: {e}")),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid_and_spotify_eq_is_off() {
        let s = SoundSettings::default();
        assert!(s.validate().is_ok());
        assert!(!s.spotify_eq);
    }

    #[test]
    fn rejects_out_of_range_values() {
        let bad = |s: SoundSettings| assert!(s.validate().is_err(), "{s:?}");
        bad(SoundSettings { preset: "dubstep".into(), ..Default::default() });
        bad(SoundSettings { bands: [13.0; BANDS], ..Default::default() });
        bad(SoundSettings { preamp_db: f32::NAN, ..Default::default() });
        bad(SoundSettings { crossfade_secs: 12.5, ..Default::default() });
        bad(SoundSettings { compressor_amount: 1.2, ..Default::default() });
        bad(SoundSettings { compressor_amount: f32::NAN, ..Default::default() });
        bad(SoundSettings { width: -0.1, ..Default::default() });
        bad(SoundSettings { device: "x\u{0}y".into(), ..Default::default() });
        assert!(SoundSettings { preset: "custom".into(), ..Default::default() }.validate().is_ok());
    }

    #[test]
    fn fills_missing_fields_from_defaults() {
        let s: SoundSettings = serde_json::from_str(r#"{"crossfadeSecs":4}"#).unwrap();
        assert_eq!(s.crossfade_secs, 4.0);
        assert!(s.normalize);
        assert_eq!(s.preset, "flat");
        assert_eq!((s.tag_gain, s.compressor, s.skip_silence), (TagGain::Track, false, false));
    }

    #[test]
    fn new_settings_round_trip_and_reject_unknown_tag_modes() {
        let s: SoundSettings = serde_json::from_str(r#"{"tagGain":"album","compressor":true,"compressorAmount":0.8,"skipSilence":true}"#).unwrap();
        assert_eq!((s.tag_gain, s.skip_silence), (TagGain::Album, true));
        assert!(serde_json::to_string(&s).unwrap().contains(r#""tagGain":"album""#));
        assert!(serde_json::from_str::<SoundSettings>(r#"{"tagGain":"loudest"}"#).is_err());
    }

    #[test]
    fn the_compressor_reaches_the_chain_only_when_switched_on() {
        let on = SoundSettings { compressor: true, compressor_amount: 0.8, ..Default::default() };
        assert_eq!(on.dsp(1.0).compress, 0.8);
        assert_eq!(SoundSettings { compressor: false, ..on }.dsp(1.0).compress, 0.0);
    }
}
