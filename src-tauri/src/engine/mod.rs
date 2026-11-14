//! Carbon's own audio engine for local files: Symphonia decode, rubato resampling, a real-time
//! DSP chain (preamp, 10-band EQ, width, compressor, limiter) and cpal output. Spotify audio never passes
//! through here; the webview hands off between the two strictly one after the other.
pub mod contain;
pub mod crossfade;
pub mod decoder;
pub mod dsp;
pub mod loudness;
mod output;
mod player;
pub mod queue;
mod resample;
mod silence;
pub mod sound;
mod source;
mod spectrum;
pub mod spotify_eq;
mod timeline;

use crate::local_library::LocalLibrary;
use dsp::Params;
use dsp::eq::{self, Bands, Preset};
use output::Shared;
use player::{Command, EngineState, Events, InUse, Player};
use queue::Repeat;
use sound::SoundSettings;
use std::path::Path;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_QUEUE: usize = 10_000;
const MAX_POSITION_MS: u64 = 24 * 60 * 60 * 1000;
const MAX_CURVE_POINTS: usize = 512;
const MIN_SPEED: f64 = 0.5;
const MAX_SPEED: f64 = 2.0;
/// Speeds snap to twentieths (0.05×).
const SPEED_STEPS: f64 = 20.0;
const BAD_SPEED: &str = "Speed must be between 0.5× and 2×.";
const STOP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);
const STOPPED: &str = "Carbon's audio engine stopped. Restart Carbon to play local files.";

pub struct Engine {
    commands: Sender<Command>,
    sound: Mutex<SoundSettings>,
    in_use: InUse,
}

struct AppEvents(AppHandle);

impl Events for AppEvents {
    fn state(&self, state: &EngineState) {
        let _ = self.0.emit("engine-state", state);
    }

    fn error(&self, message: &str) {
        eprintln!("[engine] {message}");
        let _ = self.0.emit("engine-error", message);
    }

    fn spectrum(&self, bands: &[f32]) {
        let _ = self.0.emit("engine-spectrum", bands);
    }
}

impl Engine {
    pub fn spawn(app: &AppHandle, sound: SoundSettings) -> Engine {
        let (commands, inbox) = mpsc::channel();
        let (analyze, requests) = mpsc::channel();
        let cache_dir = app.path().app_cache_dir().ok();
        let results = commands.clone();
        let spawned = std::thread::Builder::new().name("carbon-loudness".into()).spawn(move || {
            loudness::run_analyzer(cache_dir, requests, |id, gain_db| {
                let _ = results.send(Command::Loudness { id, gain_db });
            })
        });
        if let Err(e) = spawned {
            eprintln!("[engine] loudness analysis unavailable: {e}");
        }
        let shared = Arc::new(Shared::new(Params::new(sound.dsp(1.0))));
        let player = Player::new(AppEvents(app.clone()), shared, sound.clone(), analyze);
        let in_use = player.in_use();
        if let Err(e) = std::thread::Builder::new().name("carbon-audio".into()).spawn(move || player.run(inbox)) {
            eprintln!("[engine] couldn't start: {e}");
        }
        Engine { commands, sound: Mutex::new(sound), in_use }
    }

    fn send(&self, command: Command) -> Result<(), String> {
        self.commands.send(command).map_err(|_| STOPPED.to_string())
    }

    /// Whether `path` is open in the engine or is the song it is paused on.
    pub fn is_using(&self, path: &Path) -> bool {
        self.in_use.lock().is_ok_and(|paths| paths.iter().any(|p| p == path))
    }

    pub fn sound(&self) -> SoundSettings {
        self.sound.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

/// `start_ms` starts the first track part-way in one step (no burst from 0:00 before a seek).
#[tauri::command]
pub fn engine_play(
    engine: State<Engine>,
    library: State<LocalLibrary>,
    ids: Vec<String>,
    index: usize,
    repeat: Repeat,
    play_id: u32,
    start_ms: u64,
) -> Result<(), String> {
    if ids.is_empty() || ids.len() > MAX_QUEUE {
        return Err(format!("A queue holds 1 to {MAX_QUEUE} songs."));
    }
    if index >= ids.len() {
        return Err("That song isn't in the queue.".into());
    }
    let tracks = library.queue_tracks(&ids)?;
    engine.send(Command::Play { tracks, index, repeat, play_id, start_ms: start_ms.min(MAX_POSITION_MS) })
}

#[tauri::command]
pub fn engine_pause(engine: State<Engine>) -> Result<(), String> {
    engine.send(Command::Pause)
}

#[tauri::command]
pub fn engine_resume(engine: State<Engine>) -> Result<(), String> {
    engine.send(Command::Resume)
}

/// Resolves after local audio has faded out and the device is closed.
#[tauri::command]
pub async fn engine_stop(engine: State<'_, Engine>) -> Result<(), String> {
    let (done, stopped) = tokio::sync::oneshot::channel();
    engine.send(Command::Stop(done))?;
    tokio::time::timeout(STOP_TIMEOUT, stopped).await.map_err(|_| "Carbon's audio engine didn't stop in time.".to_string())?.map_err(|_| STOPPED.to_string())
}

#[tauri::command]
pub fn engine_seek(engine: State<Engine>, position_ms: u64) -> Result<(), String> {
    engine.send(Command::Seek(position_ms.min(MAX_POSITION_MS)))
}

#[tauri::command]
pub fn engine_volume(engine: State<Engine>, volume: f32) -> Result<(), String> {
    if !(0.0..=1.0).contains(&volume) {
        return Err("Volume must be between 0 and 1.".into());
    }
    engine.send(Command::Volume(volume))
}

#[tauri::command]
pub fn engine_repeat(engine: State<Engine>, repeat: Repeat) -> Result<(), String> {
    engine.send(Command::Repeat(repeat))
}

/// 0.5 to 2, snapped to the nearest 0.05.
fn snap_speed(rate: f64) -> Result<f64, String> {
    if !rate.is_finite() || !(MIN_SPEED..=MAX_SPEED).contains(&rate) {
        return Err(BAD_SPEED.into());
    }
    Ok((rate * SPEED_STEPS).round() / SPEED_STEPS)
}

/// Playback speed for local files; pitch rises and falls with it. Not saved: every session
/// starts at 1×. The engine's state carries the speed in force as `rate`.
#[tauri::command]
pub fn engine_speed(engine: State<Engine>, rate: f64) -> Result<(), String> {
    engine.send(Command::Speed(snap_speed(rate)?))
}

/// Asks for "engine-spectrum" events (32 bands, 0 to 1, about 30 a second while a local file
/// plays). A request lasts a few seconds, so a visualizer on screen keeps asking; `on: false`
/// stops at once.
#[tauri::command]
pub fn engine_spectrum(engine: State<Engine>, on: bool) -> Result<(), String> {
    engine.send(Command::Spectrum(on))
}

#[tauri::command]
pub fn sound_get(engine: State<Engine>) -> SoundSettings {
    engine.sound()
}

#[tauri::command]
pub fn sound_set(app: AppHandle, engine: State<Engine>, settings: SoundSettings) -> Result<SoundSettings, String> {
    settings.validate()?;
    sound::save(&app, &settings)?;
    *engine.sound.lock().map_err(|e| e.to_string())? = settings.clone();
    engine.send(Command::Sound(Box::new(settings.clone())))?;
    let _ = app.emit("sound-changed", &settings);
    Ok(settings)
}

#[tauri::command]
pub fn sound_presets() -> Vec<Preset> {
    eq::PRESETS.to_vec()
}

#[tauri::command]
pub fn sound_curve(bands: Bands, preamp_db: f32, points: usize) -> Result<Vec<f32>, String> {
    if !bands.iter().all(|g| eq::valid_gain(*g)) || !preamp_db.is_finite() || !(2..=MAX_CURVE_POINTS).contains(&points) {
        return Err("Those EQ values are out of range.".into());
    }
    Ok(eq::curve(&bands, preamp_db, points))
}

/// Device enumeration can take a moment on Windows, so it runs off the main thread.
#[tauri::command]
pub async fn sound_devices() -> Vec<String> {
    output::list_devices()
}

/// Used by "remove saved data": deletes the files and puts the live engine back on defaults.
pub fn delete_data(app: &AppHandle) -> Result<(), String> {
    sound::delete(app)?;
    if let Ok(dir) = app.path().app_cache_dir() {
        loudness::delete_cache(&dir)?;
    }
    let defaults = SoundSettings::default();
    let engine = app.state::<Engine>();
    *engine.sound.lock().map_err(|e| e.to_string())? = defaults.clone();
    engine.send(Command::Sound(Box::new(defaults.clone())))?;
    let _ = app.emit("sound-reset", &defaults);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn speed_snaps_to_steps_and_rejects_everything_else() {
        assert_eq!(snap_speed(1.0), Ok(1.0));
        assert_eq!(snap_speed(1.151), Ok(1.15));
        assert_eq!(snap_speed(0.5), Ok(0.5));
        assert_eq!(snap_speed(2.0), Ok(2.0));
        assert_eq!(snap_speed(0.524), Ok(0.5));
        for bad in [0.49, 2.01, 0.0, -1.0, f64::NAN, f64::INFINITY] {
            assert!(snap_speed(bad).is_err(), "{bad}");
        }
    }
}
