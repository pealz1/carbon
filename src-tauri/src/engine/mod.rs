//! Carbon's own audio engine for local files: Symphonia decode, rubato resampling, a real-time
//! DSP chain (preamp, 10-band EQ, width, limiter) and cpal output. Spotify audio never passes
//! through here; the webview hands off between the two strictly one after the other.
pub mod crossfade;
pub mod decoder;
pub mod dsp;
pub mod loudness;
mod output;
mod player;
pub mod queue;
mod resample;
pub mod sound;
mod source;
pub mod spotify_eq;
mod timeline;

use crate::library::Library;
use dsp::Params;
use dsp::eq::{self, Bands, Preset};
use output::Shared;
use player::{Command, EngineState, Events, Player};
use queue::Repeat;
use sound::SoundSettings;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_QUEUE: usize = 10_000;
const MAX_POSITION_MS: u64 = 24 * 60 * 60 * 1000;
const MAX_CURVE_POINTS: usize = 512;
const STOP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);
const STOPPED: &str = "Carbon's audio engine stopped. Restart Carbon to play local files.";

pub struct Engine {
    commands: Sender<Command>,
    sound: Mutex<SoundSettings>,
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
        if let Err(e) = std::thread::Builder::new().name("carbon-audio".into()).spawn(move || player.run(inbox)) {
            eprintln!("[engine] couldn't start: {e}");
        }
        Engine { commands, sound: Mutex::new(sound) }
    }

    fn send(&self, command: Command) -> Result<(), String> {
        self.commands.send(command).map_err(|_| STOPPED.to_string())
    }

    pub fn sound(&self) -> SoundSettings {
        self.sound.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

#[tauri::command]
pub fn engine_play(engine: State<Engine>, library: State<Library>, ids: Vec<String>, index: usize, repeat: Repeat, play_id: u32) -> Result<(), String> {
    if ids.is_empty() || ids.len() > MAX_QUEUE {
        return Err(format!("A queue holds 1 to {MAX_QUEUE} songs."));
    }
    if index >= ids.len() {
        return Err("That song isn't in the queue.".into());
    }
    let tracks = library.queue_tracks(&ids)?;
    engine.send(Command::Play { tracks, index, repeat, play_id })
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

/// Used by "remove saved data".
pub fn delete_data(app: &AppHandle) -> Result<(), String> {
    sound::delete(app)?;
    if let Ok(dir) = app.path().app_cache_dir() {
        loudness::delete_cache(&dir)?;
    }
    Ok(())
}
