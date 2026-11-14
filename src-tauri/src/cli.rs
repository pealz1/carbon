//! `carbon.exe <command>` (docs/automation.md): a second launch that controls the running Carbon
//! and exits. Commands reach the running app through the single-instance plugin. `now-playing` is
//! the exception: the second process answers it itself, before Tauri starts, from a small file the
//! running app keeps current.
use crate::links::{self, Target};
use crate::media_controls::{self, MediaCommand};
use crate::playback::{MAX_DURATION_MS, PlaybackInfo};
use crate::tray;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, TryLockError};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, RunEvent, Runtime};

/// The folder name Tauri gives the app's local data dir; `tauri.conf.json` has the same value.
const IDENTIFIER: &str = "com.pealz.carbon";
const STATE_FILE: &str = "now-playing.json";
/// Held locked for as long as Carbon runs, so a crash can't leave Carbon looking alive.
const LOCK_FILE: &str = "now-playing.lock";
const LOCK_TRIES: usize = 5;
const LOCK_RETRY: Duration = Duration::from_millis(10);
const MAX_STATE_BYTES: u64 = 16 * 1024;
const MAX_VOLUME_PERCENT: u8 = 100;
const NOT_RUNNING: &str = "Carbon isn't running.";
const EXIT_NOT_RUNNING: i32 = 1;

#[derive(Clone, PartialEq, Debug)]
pub enum Action {
    Media(MediaCommand),
    Link(Target),
    Show,
    NowPlaying { json: bool },
}

fn volume(percent: &str) -> Option<MediaCommand> {
    let percent = percent.parse::<u8>().ok().filter(|p| *p <= MAX_VOLUME_PERCENT)?;
    Some(MediaCommand::Volume { value: f64::from(percent) / 100.0 })
}

fn seek(seconds: &str) -> Option<MediaCommand> {
    let limit = MAX_DURATION_MS as f64 / 1000.0;
    let seconds = seconds.parse::<f64>().ok().filter(|s| (0.0..=limit).contains(s))?;
    Some(MediaCommand::Seek { position_ms: (seconds * 1000.0).round() as u64 })
}

/// What a launch's arguments (program name first) ask for. None is "just open Carbon": no
/// arguments, `--minimized`, and anything unknown or malformed.
pub fn parse<S: AsRef<str>>(args: &[S]) -> Option<Action> {
    let args: Vec<&str> = args.iter().skip(1).map(AsRef::as_ref).collect();
    Some(match args.as_slice() {
        ["play"] => Action::Media(MediaCommand::Play),
        ["pause"] => Action::Media(MediaCommand::Pause),
        ["toggle"] => Action::Media(MediaCommand::Toggle),
        ["next"] => Action::Media(MediaCommand::Next),
        ["previous"] => Action::Media(MediaCommand::Previous),
        ["volume", percent] => Action::Media(volume(percent)?),
        ["seek", seconds] => Action::Media(seek(seconds)?),
        ["play-uri", what] => Action::Link(links::resolve(what, true)?),
        ["show"] => Action::Show,
        ["now-playing"] => Action::NowPlaying { json: false },
        ["now-playing", "--json"] => Action::NowPlaying { json: true },
        // How Windows starts Carbon for a link: the address as the only argument.
        [url] if url.starts_with("carbon:") => Action::Link(links::from_url(url)?),
        [uri] if uri.starts_with("spotify:") => Action::Link(links::resolve(uri, false)?),
        _ => return None,
    })
}

/// The single-instance callback: a second launch's arguments, in the running Carbon.
pub fn second_launch(app: &AppHandle, args: &[String]) {
    match parse(args) {
        Some(Action::Media(command)) => media_controls::emit(app, command),
        Some(Action::Link(target)) => links::deliver(app, &target),
        // The second process printed the answer itself.
        Some(Action::NowPlaying { .. }) => {}
        Some(Action::Show) | None => tray::show_main(app),
    }
}

/// The link Carbon was started with (`carbon://…` clicked, or `play-uri`, while it was closed),
/// handed to the webview once it can follow it.
#[tauri::command]
pub fn launch_link() -> Option<Target> {
    static TAKEN: AtomicBool = AtomicBool::new(false);
    if TAKEN.swap(true, Ordering::Relaxed) {
        return None;
    }
    let args: Vec<String> = std::env::args().collect();
    match parse(&args) {
        Some(Action::Link(target)) => Some(target),
        _ => None,
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
enum Status {
    Playing,
    Paused,
    #[default]
    Stopped,
}

/// The state file: an explicit allowlist, and no position, since the file is only rewritten when
/// something else changes.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
struct NowPlaying {
    status: Status,
    title: String,
    artists: Vec<String>,
    album: String,
    artwork_url: Option<String>,
    duration_ms: u64,
}

impl From<Option<&PlaybackInfo>> for NowPlaying {
    fn from(info: Option<&PlaybackInfo>) -> Self {
        let Some(info) = info else { return Self::default() };
        Self {
            status: if info.paused { Status::Paused } else { Status::Playing },
            title: info.title.clone(),
            artists: info.artists.clone(),
            album: info.album.clone(),
            artwork_url: info.artwork_url.clone(),
            duration_ms: info.duration_ms,
        }
    }
}

impl NowPlaying {
    /// One line for a terminal. Titles come from the internet, so control characters (which could
    /// drive the terminal) are left out.
    fn line(&self) -> String {
        if self.status == Status::Stopped {
            return "Nothing is playing.".into();
        }
        let mut line = self.title.clone();
        if !self.artists.is_empty() {
            line.push_str(&format!(" \u{2014} {}", self.artists.join(", ")));
        }
        if !self.album.is_empty() {
            line.push_str(&format!(" ({})", self.album));
        }
        if self.status == Status::Paused {
            line.push_str(" [paused]");
        }
        line.chars().filter(|c| !c.is_control()).collect()
    }
}

/// Carbon's local data folder. Found without Tauri, so the running app and a `now-playing` launch
/// (which never starts Tauri) always agree on it.
fn data_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|dir| PathBuf::from(dir).join(IDENTIFIER))
}

/// Replaces the state file in one step, so a reader never sees half of it.
fn write_state(dir: &Path, state: &NowPlaying) -> Result<(), String> {
    let text = serde_json::to_string(state).map_err(|e| e.to_string())?;
    let (file, draft) = (dir.join(STATE_FILE), dir.join(format!("{STATE_FILE}.tmp")));
    fs::write(&draft, text).and_then(|()| fs::rename(&draft, &file)).map_err(|e| format!("could not save {}: {e}", file.display()))
}

/// What's playing for the command line, kept by the running app (see `plugin`).
pub struct StateFile {
    /// None when this isn't the Carbon that owns the file; then nothing is written or removed.
    owned: Option<(PathBuf, File)>,
    written: Mutex<Option<NowPlaying>>,
}

impl StateFile {
    fn open(dir: Option<PathBuf>) -> Self {
        let owned = dir.and_then(|dir| match lock_dir(&dir) {
            Ok(lock) => Some((dir, lock)),
            Err(e) => {
                eprintln!("[cli] `carbon now-playing` won't work this run: {e}");
                None
            }
        });
        let file = Self { owned, written: Mutex::default() };
        file.update(None);
        file
    }

    /// Called for every playback report; writes only when something other than position changed.
    pub fn update(&self, info: Option<&PlaybackInfo>) {
        let Some((dir, _)) = &self.owned else { return };
        let next = NowPlaying::from(info);
        let mut written = self.written.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if written.as_ref() == Some(&next) {
            return;
        }
        match write_state(dir, &next) {
            Ok(()) => *written = Some(next),
            Err(e) => eprintln!("[cli] {e}"),
        }
    }

    fn remove(&self) {
        let Some((dir, _)) = &self.owned else { return };
        for name in [STATE_FILE, LOCK_FILE] {
            if let Err(e) = fs::remove_file(dir.join(name))
                && e.kind() != std::io::ErrorKind::NotFound
            {
                eprintln!("[cli] could not remove {name}: {e}");
            }
        }
    }
}

fn lock_dir(dir: &Path) -> Result<File, String> {
    fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    let lock = File::options().write(true).create(true).truncate(false).open(dir.join(LOCK_FILE));
    let lock = lock.map_err(|e| format!("could not create the lock file: {e}"))?;
    // A `now-playing` launch holds the lock for an instant while it checks; wait that out.
    for _ in 0..LOCK_TRIES {
        match lock.try_lock() {
            Ok(()) => return Ok(lock),
            Err(TryLockError::WouldBlock) => std::thread::sleep(LOCK_RETRY),
            Err(TryLockError::Error(e)) => return Err(format!("could not lock the lock file: {e}")),
        }
    }
    Err("another Carbon holds the lock file".into())
}

/// Whether a running Carbon holds the lock in `dir`.
fn is_running(dir: &Path) -> bool {
    let Ok(lock) = File::open(dir.join(LOCK_FILE)) else { return false };
    matches!(lock.try_lock(), Err(TryLockError::WouldBlock))
}

/// The state file is a file like any other: bounded, and parsed into the allowlist.
fn read_state(dir: &Path) -> Result<NowPlaying, String> {
    let file = File::open(dir.join(STATE_FILE)).map_err(|e| e.to_string())?;
    let mut text = String::new();
    file.take(MAX_STATE_BYTES).read_to_string(&mut text).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

/// What `now-playing` prints, and the exit code.
fn answer(dir: Option<&Path>, json: bool) -> (String, i32) {
    let Some(dir) = dir.filter(|dir| is_running(dir)) else { return (NOT_RUNNING.into(), EXIT_NOT_RUNNING) };
    match read_state(dir) {
        Ok(state) if json => (serde_json::to_string(&state).unwrap_or_default(), 0),
        Ok(state) => (state.line(), 0),
        Err(e) => (format!("Couldn't read what Carbon is playing: {e}"), EXIT_NOT_RUNNING),
    }
}

/// Carbon is a windowed program, so Windows starts it without a console; this borrows the one of
/// the terminal that launched it. Only when there is no output yet: attaching would swap a pipe
/// or file that cmd set up (`carbon now-playing > file`) for the console. Fails harmlessly when
/// there is no terminal either.
#[cfg(windows)]
fn attach_console() {
    use std::os::windows::io::AsRawHandle;
    const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
    }
    if std::io::stdout().as_raw_handle().is_null() {
        // SAFETY: takes no pointers and only changes which console this process writes to.
        unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
    }
}

#[cfg(not(windows))]
fn attach_console() {}

/// For `main`, before Tauri starts: the exit code when this launch only asked what's playing.
/// No window is created and the running Carbon isn't disturbed.
pub fn run_early() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    let Some(Action::NowPlaying { json }) = parse(&args) else { return None };
    attach_console();
    let (text, code) = answer(data_dir().as_deref(), json);
    // Nobody is left to tell if the terminal has gone away.
    let _ = writeln!(std::io::stdout(), "{text}");
    Some(code)
}

/// Keeps the now-playing file for as long as Carbon runs, and removes it on the way out.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("carbon-cli")
        .setup(|app, _| {
            app.manage(StateFile::open(data_dir()));
            Ok(())
        })
        .on_event(|app, event| {
            if let RunEvent::Exit = event
                && let Some(file) = app.try_state::<StateFile>()
            {
                file.remove();
            }
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::sample;

    const TRACK: &str = "spotify:track:6rqhFgbbKwnb9MLmUQDhG6";

    fn run(line: &str) -> Option<Action> {
        let args: Vec<&str> = std::iter::once("carbon.exe").chain(line.split_whitespace()).collect();
        parse(&args)
    }

    fn media(command: MediaCommand) -> Option<Action> {
        Some(Action::Media(command))
    }

    /// A fresh folder under the system temp dir, removed when dropped.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("carbon-cli-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            Self(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn parses_commands() {
        assert_eq!(run("play"), media(MediaCommand::Play));
        assert_eq!(run("pause"), media(MediaCommand::Pause));
        assert_eq!(run("toggle"), media(MediaCommand::Toggle));
        assert_eq!(run("next"), media(MediaCommand::Next));
        assert_eq!(run("previous"), media(MediaCommand::Previous));
        assert_eq!(run("volume 35"), media(MediaCommand::Volume { value: 0.35 }));
        assert_eq!(run("volume 0"), media(MediaCommand::Volume { value: 0.0 }));
        assert_eq!(run("seek 61.5"), media(MediaCommand::Seek { position_ms: 61_500 }));
        assert_eq!(run("show"), Some(Action::Show));
        assert_eq!(run("now-playing"), Some(Action::NowPlaying { json: false }));
        assert_eq!(run("now-playing --json"), Some(Action::NowPlaying { json: true }));
    }

    #[test]
    fn parses_things_to_play_and_links() {
        let track = Some(Action::Link(Target::Play { uri: TRACK.into() }));
        assert_eq!(run(&format!("play-uri {TRACK}")), track);
        assert_eq!(run("play-uri https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6?si=x"), track);
        assert_eq!(run("play-uri ytm:video:dQw4w9WgXcQ"), Some(Action::Link(Target::Play { uri: "ytm:video:dQw4w9WgXcQ".into() })));
        let album = "spotify:album:6rqhFgbbKwnb9MLmUQDhG6";
        assert_eq!(run(&format!("play-uri {album}")), Some(Action::Link(Target::Play { uri: album.into() })));
        assert_eq!(run(&format!("carbon://play/{TRACK}")), track);
        assert_eq!(run("carbon://open/liked"), Some(Action::Link(Target::Open { path: "/liked".into() })));
        assert_eq!(run(album), Some(Action::Link(Target::Open { path: "/album/6rqhFgbbKwnb9MLmUQDhG6".into() })));
    }

    #[test]
    fn anything_else_only_opens_carbon() {
        for line in [
            "",
            "--minimized",
            "quit",
            "play now",
            "PLAY",
            "volume",
            "volume 101",
            "volume -1",
            "volume 50%",
            "volume 0.5",
            "seek",
            "seek -1",
            "seek NaN",
            "seek inf",
            "seek 90000",
            "seek 1 2",
            "play-uri",
            "play-uri spotify:user:someone",
            "play-uri https://evil.example/x",
            "now-playing --xml",
            "carbon://quit",
            &format!("carbon://play/{TRACK} --minimized"),
            &format!("--flag carbon://play/{TRACK}"),
        ] {
            assert_eq!(run(line), None, "{line}");
        }
        assert_eq!(parse::<&str>(&[]), None);
    }

    #[test]
    fn describes_what_is_playing_in_one_safe_line() {
        let playing = NowPlaying::from(Some(&sample("t1", 229_000, 10_000, false)));
        assert_eq!(playing.line(), "No Surprises \u{2014} Radiohead (OK Computer)");
        let mut paused = NowPlaying::from(Some(&sample("t1", 229_000, 10_000, true)));
        paused.title = "Evil\u{1b}[2J\r\nSong".into();
        paused.album.clear();
        assert_eq!(paused.line(), "Evil[2JSong \u{2014} Radiohead [paused]");
        assert_eq!(NowPlaying::from(None).line(), "Nothing is playing.");
    }

    #[test]
    fn the_state_file_holds_only_the_allowlist() {
        let mut info = sample("t1", 229_000, 10_000, false);
        info.volume = Some(0.4);
        let json = serde_json::to_value(NowPlaying::from(Some(&info))).unwrap();
        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["album", "artists", "artworkUrl", "durationMs", "status", "title"]);
        assert_eq!(json["status"], "playing");
    }

    #[test]
    fn keeps_the_file_current_and_answers_from_it() {
        let scratch = Scratch::new("current");
        let dir = scratch.0.as_path();
        assert_eq!(answer(Some(dir), false), (NOT_RUNNING.to_string(), EXIT_NOT_RUNNING), "no folder yet");
        assert_eq!(answer(None, true), (NOT_RUNNING.to_string(), EXIT_NOT_RUNNING));

        let file = StateFile::open(Some(dir.to_path_buf()));
        assert_eq!(answer(Some(dir), false), ("Nothing is playing.".to_string(), 0));
        file.update(Some(&sample("t1", 229_000, 10_000, false)));
        assert_eq!(answer(Some(dir), false).0, "No Surprises \u{2014} Radiohead (OK Computer)");
        let (json, code) = answer(Some(dir), true);
        assert_eq!(code, 0);
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!((parsed["status"].as_str(), parsed["durationMs"].as_u64()), (Some("playing"), Some(229_000)));

        // A second Carbon (it exits at once) never touches the first one's file.
        let second = StateFile::open(Some(dir.to_path_buf()));
        second.update(None);
        second.remove();
        assert_eq!(answer(Some(dir), false).0, "No Surprises \u{2014} Radiohead (OK Computer)");

        file.remove();
        assert!(!dir.join(STATE_FILE).exists() && !dir.join(LOCK_FILE).exists(), "nothing left behind on exit");
        drop(file);
        assert_eq!(answer(Some(dir), false).1, EXIT_NOT_RUNNING, "the lock goes with the process");
    }

    #[test]
    fn rewrites_the_file_only_when_something_other_than_position_changes() {
        let scratch = Scratch::new("position");
        let file = StateFile::open(Some(scratch.0.clone()));
        let path = scratch.0.join(STATE_FILE);
        file.update(Some(&sample("t1", 229_000, 10_000, false)));
        fs::remove_file(&path).unwrap();
        file.update(Some(&sample("t1", 229_000, 55_000, false)));
        assert!(!path.exists(), "a position-only report wrote the file");
        file.update(Some(&sample("t1", 229_000, 55_000, true)));
        assert!(read_state(&scratch.0).is_ok_and(|state| state.status == Status::Paused));
    }

    #[test]
    fn a_crashed_carbon_or_a_damaged_file_is_not_an_answer() {
        let scratch = Scratch::new("stale");
        let dir = scratch.0.as_path();
        drop(StateFile::open(Some(dir.to_path_buf())));
        assert!(dir.join(STATE_FILE).exists(), "left behind, as after a crash");
        assert_eq!(answer(Some(dir), false), (NOT_RUNNING.to_string(), EXIT_NOT_RUNNING));

        let _running = StateFile::open(Some(dir.to_path_buf()));
        fs::write(dir.join(STATE_FILE), "{ not json").unwrap();
        let (text, code) = answer(Some(dir), true);
        assert!(text.starts_with("Couldn't read what Carbon is playing") && code == EXIT_NOT_RUNNING, "{text}");
    }

    #[test]
    fn uses_the_folder_tauri_gives_the_app() {
        assert!(include_str!("../tauri.conf.json").contains(&format!(r#""identifier": "{IDENTIFIER}""#)));
    }
}
