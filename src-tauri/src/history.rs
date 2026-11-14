//! What was actually listened to on this PC. The webview decides when a play counts (half the
//! song or four minutes) and sends one entry; each is appended as a line of `history.jsonl` in the
//! app data folder, so a play costs one small write. The file is only read when a page asks for
//! it, and is cut back to the newest `MAX_ENTRIES` once it grows past that.
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const FILE: &str = "history.jsonl";
/// Present while the listener has paused history.
const PAUSED_FILE: &str = "history.paused";
pub const MAX_ENTRIES: usize = 50_000;
/// Lines past the cap before the file is rewritten, so compaction is rare rather than per play.
const COMPACT_SLACK: usize = 1_000;
const MAX_URI_LEN: usize = 200;
const MAX_TEXT_CHARS: usize = 300;
const MAX_ARTISTS: usize = 32;
const MAX_IMAGE_LEN: usize = 512;
const MAX_DURATION_MS: u64 = 24 * 60 * 60 * 1000;
const MAX_SOURCE_LEN: usize = 16;
/// Never a song (a station) or never one of Carbon's own links.
const REFUSED_SCHEMES: [&str; 6] = ["radio", "http", "https", "file", "data", "javascript"];

/// `spotify:track:…`, `ytm:video:…`, `local:…`: a lowercase scheme, then printable ASCII.
pub fn check_uri(uri: &str) -> Result<(), String> {
    let scheme = uri.split_once(':').map(|(scheme, rest)| (scheme, !rest.is_empty()));
    let ok = matches!(scheme, Some((s, true)) if !s.is_empty() && s.chars().all(|c| c.is_ascii_lowercase()) && !REFUSED_SCHEMES.contains(&s))
        && uri.len() <= MAX_URI_LEN
        && uri.chars().all(|c| c.is_ascii_graphic());
    if ok { Ok(()) } else { Err("that isn't a song, album or page Carbon knows".into()) }
}

pub fn check_text(text: &str, what: &str, required: bool) -> Result<(), String> {
    if required && text.trim().is_empty() {
        return Err(format!("{what} can't be blank"));
    }
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(format!("{what} must be {MAX_TEXT_CHARS} characters or fewer"));
    }
    if text.chars().any(char::is_control) {
        return Err(format!("{what} can't contain control characters"));
    }
    Ok(())
}

/// Artwork is only ever loaded over https.
pub fn check_image(image: Option<&str>) -> Result<(), String> {
    match image {
        Some(url) if !url.starts_with("https://") || url.len() > MAX_IMAGE_LEN || url.chars().any(|c| c.is_control() || c.is_whitespace()) => {
            Err("artwork must be an https address".into())
        }
        _ => Ok(()),
    }
}

/// A song as Carbon remembers it: enough to show it and play it again without asking a service.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub uri: String,
    pub title: String,
    #[serde(default)]
    pub artists: Vec<String>,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub duration_ms: u64,
}

impl Song {
    pub fn validate(&self) -> Result<(), String> {
        check_uri(&self.uri)?;
        check_text(&self.title, "a song title", true)?;
        if self.artists.len() > MAX_ARTISTS {
            return Err(format!("a song can list at most {MAX_ARTISTS} artists"));
        }
        self.artists.iter().try_for_each(|a| check_text(a, "an artist name", false))?;
        check_text(&self.album, "an album name", false)?;
        check_image(self.image.as_deref())?;
        if self.duration_ms > MAX_DURATION_MS {
            return Err("that song is too long to be a song".into());
        }
        Ok(())
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// When the play counted, in milliseconds since 1970.
    pub at: u64,
    /// Who played it: "spotify", "youtube", "local", or a source added later.
    pub source: String,
    #[serde(flatten)]
    pub song: Song,
}

impl Entry {
    pub fn validate(&self) -> Result<(), String> {
        self.song.validate()?;
        let source_ok = !self.source.is_empty() && self.source.len() <= MAX_SOURCE_LEN && self.source.chars().all(|c| c.is_ascii_lowercase()) && self.source != "radio";
        if self.at == 0 || !source_ok {
            return Err("that play isn't valid".into());
        }
        Ok(())
    }
}

/// The valid entries of a history file, oldest first. A torn or hand-edited line is skipped, not fatal.
fn parse(text: &str) -> (Vec<Entry>, usize) {
    let lines = text.lines().filter(|line| !line.trim().is_empty());
    let (good, bad): (Vec<_>, Vec<_>) = lines.map(|line| serde_json::from_str::<Entry>(line).ok().filter(|e| e.validate().is_ok())).partition(Option::is_some);
    (good.into_iter().flatten().collect(), bad.len())
}

fn newest(mut entries: Vec<Entry>, keep: usize) -> Vec<Entry> {
    let extra = entries.len().saturating_sub(keep);
    entries.drain(..extra);
    entries
}

fn read_entries(file: &Path, keep: usize) -> Vec<Entry> {
    fs::read_to_string(file).map(|text| newest(parse(&text).0, keep)).unwrap_or_default()
}

/// How many lines the file holds. A last line cut short by a crash is closed, so the next entry starts clean.
fn count_lines(file: &Path) -> usize {
    let Ok(text) = fs::read_to_string(file) else { return 0 };
    if !text.is_empty() && !text.ends_with('\n') {
        let closed = OpenOptions::new().append(true).open(file).and_then(|mut f| f.write_all(b"\n"));
        if let Err(e) = closed {
            eprintln!("[history] could not repair {}: {e}", file.display());
        }
    }
    text.lines().filter(|line| !line.trim().is_empty()).count()
}

fn append(file: &Path, entry: &Entry) -> Result<(), String> {
    let failed = |e: std::io::Error| format!("could not save your history: {e}");
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(failed)?;
    }
    let line = serde_json::to_string(entry).map_err(|e| e.to_string())? + "\n";
    OpenOptions::new().create(true).append(true).open(file).and_then(|mut f| f.write_all(line.as_bytes())).map_err(failed)
}

/// Rewrites the file with its newest `keep` entries (atomically). Lines that couldn't be read are
/// dropped, after a copy of the whole file is kept at `history.jsonl.bak`. Returns the new count.
fn compact(file: &Path, keep: usize) -> Result<usize, String> {
    let failed = |e: std::io::Error| format!("could not tidy your history: {e}");
    let text = fs::read_to_string(file).map_err(failed)?;
    let (entries, bad) = parse(&text);
    if bad > 0 {
        let backup = file.with_extension("jsonl.bak");
        eprintln!("[history] {bad} unreadable lines in {}; kept a copy at {}", file.display(), backup.display());
        fs::copy(file, &backup).map_err(failed)?;
    }
    let kept = newest(entries, keep);
    let mut out = String::with_capacity(text.len());
    for entry in &kept {
        out.push_str(&serde_json::to_string(entry).map_err(|e| e.to_string())?);
        out.push('\n');
    }
    let tmp = file.with_extension("jsonl.tmp");
    fs::write(&tmp, out).map_err(failed)?;
    fs::rename(&tmp, file).map_err(failed)?;
    Ok(kept.len())
}

fn remove(file: &Path) -> Result<(), String> {
    match fs::remove_file(file) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("could not remove your history: {e}")),
        _ => Ok(()),
    }
}

pub struct History {
    dir: Option<PathBuf>,
    /// Lines in the file, counted the first time a play is saved. Also serialises every read and write.
    lines: Mutex<Option<usize>>,
    keep: usize,
    slack: usize,
}

impl History {
    pub fn new(app: &AppHandle) -> History {
        History::at(app.path().app_data_dir().ok(), MAX_ENTRIES, COMPACT_SLACK)
    }

    fn at(dir: Option<PathBuf>, keep: usize, slack: usize) -> History {
        History { dir, lines: Mutex::new(None), keep, slack }
    }

    fn file(&self, name: &str) -> Result<PathBuf, String> {
        self.dir.as_ref().map(|d| d.join(name)).ok_or_else(|| "Carbon can't find its data folder".to_string())
    }

    fn entries(&self) -> Result<Vec<Entry>, String> {
        let _guard = self.lines.lock().map_err(|e| e.to_string())?;
        Ok(read_entries(&self.file(FILE)?, self.keep))
    }

    fn paused(&self) -> bool {
        self.file(PAUSED_FILE).is_ok_and(|f| f.exists())
    }

    fn set_paused(&self, paused: bool) -> Result<(), String> {
        let marker = self.file(PAUSED_FILE)?;
        if !paused {
            return remove(&marker);
        }
        if let Some(dir) = marker.parent() {
            fs::create_dir_all(dir).map_err(|e| format!("could not pause your history: {e}"))?;
        }
        fs::write(&marker, "").map_err(|e| format!("could not pause your history: {e}"))
    }

    /// Saves one play. False (and nothing written) while history is paused.
    fn add(&self, entry: &Entry) -> Result<bool, String> {
        entry.validate()?;
        let file = self.file(FILE)?;
        let mut lines = self.lines.lock().map_err(|e| e.to_string())?;
        if self.paused() {
            return Ok(false);
        }
        let before = lines.unwrap_or_else(|| count_lines(&file));
        append(&file, entry)?;
        let count = before + 1;
        // The play is saved either way; a failed tidy-up is retried on the next one.
        let tidied = if count > self.keep + self.slack { compact(&file, self.keep).map_err(|e| eprintln!("[history] {e}")).ok() } else { None };
        *lines = Some(tidied.unwrap_or(count));
        Ok(true)
    }

    fn clear(&self) -> Result<(), String> {
        let mut lines = self.lines.lock().map_err(|e| e.to_string())?;
        remove(&self.file(FILE)?)?;
        *lines = Some(0);
        Ok(())
    }

    /// "Remove saved data": the history, its backup and the pause switch.
    pub fn delete_data(&self) -> Result<(), String> {
        self.clear()?;
        remove(&self.file(FILE)?.with_extension("jsonl.bak"))?;
        remove(&self.file(PAUSED_FILE)?)
    }
}

// `async`: these read or write a file that can hold 50,000 plays, so they stay off the main thread.
#[tauri::command(async)]
pub fn history_get(history: State<History>) -> Result<Vec<Entry>, String> {
    history.entries()
}

#[tauri::command(async)]
pub fn history_add(history: State<History>, entry: Entry) -> Result<bool, String> {
    history.add(&entry)
}

#[tauri::command(async)]
pub fn history_clear(history: State<History>) -> Result<(), String> {
    history.clear()
}

#[tauri::command]
pub fn history_paused(history: State<History>) -> bool {
    history.paused()
}

#[tauri::command]
pub fn history_pause(history: State<History>, paused: bool) -> Result<bool, String> {
    history.set_paused(paused)?;
    Ok(paused)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(at: u64, uri: &str) -> Entry {
        Entry {
            at,
            source: "spotify".into(),
            song: Song { uri: uri.into(), title: "Song".into(), artists: vec!["Band".into()], album: "Album".into(), image: Some("https://i.scdn.co/x".into()), duration_ms: 200_000 },
        }
    }

    fn sample(at: u64) -> Entry {
        entry(at, "spotify:track:4uLU6hMCjMI75M1A2tKUQC")
    }

    fn temp(name: &str, keep: usize, slack: usize) -> (History, PathBuf) {
        let dir = std::env::temp_dir().join(format!("carbon-history-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        (History::at(Some(dir.clone()), keep, slack), dir)
    }

    #[test]
    fn accepts_songs_from_every_source() {
        for uri in ["spotify:track:4uLU6hMCjMI75M1A2tKUQC", "ytm:video:dQw4w9WgXcQ", "local:0123456789abcdef0123456789abcdef", "bandcamp:track:12/34"] {
            assert!(entry(1, uri).validate().is_ok(), "{uri} should be accepted");
        }
        let bare = Entry { song: Song { artists: vec![], album: String::new(), image: None, ..sample(1).song }, ..sample(1) };
        assert!(bare.validate().is_ok());
    }

    #[test]
    fn refuses_stations_web_links_and_malformed_uris() {
        for uri in ["radio:station:abc", "https://evil.example/x", "javascript:alert(1)", "", "nocolon", "spotify:", ":track", "Spotify:track:a", "spotify:track:a b", "spotify:track:\u{e9}"] {
            assert!(entry(1, uri).validate().is_err(), "{uri:?} should be refused");
        }
        assert!(entry(1, &format!("spotify:track:{}", "a".repeat(MAX_URI_LEN))).validate().is_err());
    }

    #[test]
    fn refuses_bad_details() {
        let with = |change: fn(&mut Entry)| {
            let mut e = sample(1);
            change(&mut e);
            e
        };
        let cases = [
            with(|e| e.at = 0),
            with(|e| e.source = "radio".into()),
            with(|e| e.source = String::new()),
            with(|e| e.source = "Spotify Web".into()),
            with(|e| e.song.title = "  ".into()),
            with(|e| e.song.title = "bell\u{0007}".into()),
            with(|e| e.song.title = "x".repeat(MAX_TEXT_CHARS + 1)),
            with(|e| e.song.artists = vec!["a".into(); MAX_ARTISTS + 1]),
            with(|e| e.song.album = "tab\there".into()),
            with(|e| e.song.image = Some("http://plain.example/a.jpg".into())),
            with(|e| e.song.image = Some("javascript:alert(1)".into())),
            with(|e| e.song.image = Some(format!("https://a.example/{}", "x".repeat(MAX_IMAGE_LEN)))),
            with(|e| e.song.duration_ms = MAX_DURATION_MS + 1),
        ];
        for bad in cases {
            assert!(bad.validate().is_err(), "{bad:?} should be refused");
        }
    }

    #[test]
    fn writes_one_camel_case_line_per_play() {
        let json = serde_json::to_string(&sample(7)).unwrap();
        assert!(json.contains(r#""at":7"#) && json.contains(r#""durationMs":200000"#) && json.contains(r#""uri":"spotify:track:"#));
        assert!(!json.contains('\n') && !json.contains("song"));
        assert_eq!(serde_json::from_str::<Entry>(&json).unwrap(), sample(7));
    }

    #[test]
    fn appends_and_reads_back_in_order() {
        let (history, dir) = temp("roundtrip", 10, 2);
        assert!(history.entries().unwrap().is_empty());
        for at in 1..=3 {
            assert!(history.add(&sample(at)).unwrap());
        }
        assert_eq!(history.entries().unwrap(), vec![sample(1), sample(2), sample(3)]);
        assert!(history.add(&entry(4, "radio:station:x")).is_err());
        history.clear().unwrap();
        assert!(history.entries().unwrap().is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn skips_unreadable_lines_and_repairs_a_torn_tail() {
        let (history, dir) = temp("torn", 10, 2);
        fs::create_dir_all(&dir).unwrap();
        let good = serde_json::to_string(&sample(1)).unwrap();
        fs::write(dir.join(FILE), format!("{good}\n{{ not json\n\n{{\"at\":2,\"sou")).unwrap();
        assert_eq!(history.entries().unwrap(), vec![sample(1)]);
        history.add(&sample(3)).unwrap();
        assert_eq!(history.entries().unwrap(), vec![sample(1), sample(3)]);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn keeps_only_the_newest_plays() {
        let (history, dir) = temp("cap", 5, 2);
        for at in 1..=7 {
            history.add(&sample(at)).unwrap();
        }
        // Reads never return more than the cap, even before the file is tidied.
        assert_eq!(history.entries().unwrap().iter().map(|e| e.at).collect::<Vec<_>>(), [3, 4, 5, 6, 7]);
        assert_eq!(fs::read_to_string(dir.join(FILE)).unwrap().lines().count(), 7);
        history.add(&sample(8)).unwrap();
        assert_eq!(fs::read_to_string(dir.join(FILE)).unwrap().lines().count(), 5);
        assert_eq!(history.entries().unwrap().iter().map(|e| e.at).collect::<Vec<_>>(), [4, 5, 6, 7, 8]);
        history.add(&sample(9)).unwrap();
        assert_eq!(*history.lines.lock().unwrap(), Some(6));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn tidying_keeps_a_copy_when_lines_were_unreadable() {
        let (history, dir) = temp("backup", 2, 0);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE), "{ not json\n").unwrap();
        for at in 1..=2 {
            history.add(&sample(at)).unwrap();
        }
        assert_eq!(history.entries().unwrap(), vec![sample(1), sample(2)]);
        assert!(fs::read_to_string(dir.join(FILE).with_extension("jsonl.bak")).unwrap().starts_with("{ not json"));
        assert_eq!(fs::read_to_string(dir.join(FILE)).unwrap().lines().count(), 2);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn pausing_stops_recording_and_survives_a_restart() {
        let (history, dir) = temp("pause", 10, 2);
        assert!(!history.paused());
        history.set_paused(true).unwrap();
        assert!(!history.add(&sample(1)).unwrap());
        assert!(history.entries().unwrap().is_empty());
        assert!(History::at(Some(dir.clone()), 10, 2).paused());
        history.set_paused(false).unwrap();
        history.set_paused(false).unwrap();
        assert!(history.add(&sample(2)).unwrap());
        history.set_paused(true).unwrap();
        history.delete_data().unwrap();
        assert!(!history.paused() && history.entries().unwrap().is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn says_so_when_there_is_no_data_folder() {
        let history = History::at(None, 10, 2);
        assert!(history.add(&sample(1)).is_err());
        assert!(!history.paused());
    }
}
