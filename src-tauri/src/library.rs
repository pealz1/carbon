//! Carbon-side library organisation Spotify's API doesn't offer: playlist folders (nestable),
//! tags and pins. Owned by Rust and persisted as JSON in the app config directory.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const FILE: &str = "library.json";
const MAX_DEPTH: usize = 6;
const MAX_FOLDERS: usize = 500;
const MAX_PLACED: usize = 10_000;
const MAX_TAGGED: usize = 10_000;
const MAX_TAGS_PER_PLAYLIST: usize = 20;
const MAX_PINS: usize = 100;
const MAX_NAME_CHARS: usize = 80;
const MAX_TAG_CHARS: usize = 32;
const MAX_ID_LEN: usize = 64;

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub collapsed: bool,
    pub folders: Vec<Folder>,
    /// Spotify playlist ids, in display order.
    pub playlists: Vec<String>,
}

/// Folders are a tree (children inside parents), so a folder can never contain itself.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Library {
    pub folders: Vec<Folder>,
    /// Playlist id -> its tags.
    pub tags: BTreeMap<String, Vec<String>>,
    /// Pinned playlist ids, in pin order.
    pub pins: Vec<String>,
}

/// Folder ids are made by Carbon (UUIDs); letters, digits, '-' and '_' only.
fn is_folder_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID_LEN && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Spotify ids are base-62.
fn is_playlist_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID_LEN && id.chars().all(|c| c.is_ascii_alphanumeric())
}

fn check_text(text: &str, max: usize, what: &str) -> Result<(), String> {
    if text.trim().is_empty() || text.trim() != text {
        return Err(format!("{what} can't be blank or start or end with spaces"));
    }
    if text.chars().count() > max {
        return Err(format!("{what} must be {max} characters or fewer"));
    }
    if text.chars().any(char::is_control) {
        return Err(format!("{what} can't contain control characters"));
    }
    Ok(())
}

#[derive(Default)]
struct Seen {
    folders: HashSet<String>,
    playlists: HashSet<String>,
}

fn check_folder(folder: &Folder, depth: usize, seen: &mut Seen) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Err(format!("folders can only nest {MAX_DEPTH} deep"));
    }
    if !is_folder_id(&folder.id) {
        return Err("a folder has an invalid id".into());
    }
    if !seen.folders.insert(folder.id.clone()) {
        return Err("two folders share an id".into());
    }
    if seen.folders.len() > MAX_FOLDERS {
        return Err(format!("you can have at most {MAX_FOLDERS} folders"));
    }
    check_text(&folder.name, MAX_NAME_CHARS, "a folder name")?;
    for id in &folder.playlists {
        if !is_playlist_id(id) {
            return Err("a folder holds an invalid playlist id".into());
        }
        if !seen.playlists.insert(id.clone()) {
            return Err("a playlist can only be in one folder".into());
        }
    }
    if seen.playlists.len() > MAX_PLACED {
        return Err("too many playlists in folders".into());
    }
    folder.folders.iter().try_for_each(|child| check_folder(child, depth + 1, seen))
}

impl Library {
    /// Rejects anything the sidebar can't render instead of silently storing it.
    pub fn validate(&self) -> Result<(), String> {
        let mut seen = Seen::default();
        self.folders.iter().try_for_each(|f| check_folder(f, 1, &mut seen))?;
        if self.tags.len() > MAX_TAGGED {
            return Err("too many tagged playlists".into());
        }
        for (id, tags) in &self.tags {
            if !is_playlist_id(id) {
                return Err("a tag is attached to an invalid playlist id".into());
            }
            if tags.len() > MAX_TAGS_PER_PLAYLIST {
                return Err(format!("a playlist can have at most {MAX_TAGS_PER_PLAYLIST} tags"));
            }
            let mut unique = HashSet::new();
            for tag in tags {
                check_text(tag, MAX_TAG_CHARS, "a tag")?;
                if !unique.insert(tag.to_lowercase()) {
                    return Err(format!("the tag '{tag}' is listed twice"));
                }
            }
        }
        if self.pins.len() > MAX_PINS {
            return Err(format!("you can pin at most {MAX_PINS} playlists"));
        }
        let mut pinned = HashSet::new();
        for id in &self.pins {
            if !is_playlist_id(id) || !pinned.insert(id) {
                return Err("pins must be distinct playlist ids".into());
            }
        }
        Ok(())
    }
}

pub struct LibraryState(pub Mutex<Library>);

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(FILE))
}

/// Reads a saved library. A corrupt or invalid file is moved aside to `library.json.bak`
/// rather than overwritten on the next save, so hand-built folders can be recovered.
fn read_from(file: &Path) -> Library {
    let Ok(text) = fs::read_to_string(file) else { return Library::default() };
    match serde_json::from_str::<Library>(&text).map_err(|e| e.to_string()).and_then(|l| l.validate().map(|()| l)) {
        Ok(library) => library,
        Err(e) => {
            let backup = file.with_extension("json.bak");
            eprintln!("[library] {} is invalid ({e}); kept a copy at {}", file.display(), backup.display());
            if let Err(e) = fs::rename(file, &backup) {
                eprintln!("[library] could not keep a copy: {e}");
            }
            Library::default()
        }
    }
}

/// Writes atomically: a crash mid-save leaves the previous file intact.
fn write_to(file: &Path, library: &Library) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("could not create the library folder: {e}"))?;
    }
    let text = serde_json::to_string_pretty(library).map_err(|e| e.to_string())?;
    let tmp = file.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| format!("could not save your library: {e}"))?;
    fs::rename(&tmp, file).map_err(|e| format!("could not save your library: {e}"))
}

pub fn load(app: &AppHandle) -> Library {
    path(app).map(|file| read_from(&file)).unwrap_or_default()
}

#[tauri::command]
pub fn library_get(state: State<LibraryState>) -> Result<Library, String> {
    state.0.lock().map(|l| l.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn library_set(app: AppHandle, state: State<LibraryState>, library: Library) -> Result<Library, String> {
    library.validate()?;
    write_to(&path(&app)?, &library)?;
    *state.0.lock().map_err(|e| e.to_string())? = library.clone();
    Ok(library)
}

/// Removes the library file and forgets it in memory (used by "remove saved data").
pub fn delete(app: &AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<LibraryState>()
        && let Ok(mut library) = state.0.lock()
    {
        *library = Library::default();
    }
    match fs::remove_file(path(app)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("could not remove your library: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(id: &str, playlists: &[&str], folders: Vec<Folder>) -> Folder {
        Folder {
            id: id.into(),
            name: format!("Folder {id}"),
            collapsed: false,
            folders,
            playlists: playlists.iter().map(|p| p.to_string()).collect(),
        }
    }

    fn sample() -> Library {
        Library {
            folders: vec![folder("f1", &["p1"], vec![folder("f2", &["p2"], vec![])])],
            tags: BTreeMap::from([("p1".into(), vec!["chill".into(), "focus".into()])]),
            pins: vec!["p3".into()],
        }
    }

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("carbon-library-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join(FILE)
    }

    #[test]
    fn defaults_and_samples_are_valid() {
        assert!(Library::default().validate().is_ok());
        assert!(sample().validate().is_ok());
    }

    #[test]
    fn rejects_bad_folders() {
        let mut bad = sample();
        bad.folders[0].id = "has space".into();
        assert!(bad.validate().is_err());

        let mut dup_id = sample();
        dup_id.folders[0].folders[0].id = "f1".into();
        assert!(dup_id.validate().is_err());

        let mut blank = sample();
        blank.folders[0].name = "  ".into();
        assert!(blank.validate().is_err());

        let mut padded = sample();
        padded.folders[0].name = " Rock".into();
        assert!(padded.validate().is_err());

        let mut long = sample();
        long.folders[0].name = "x".repeat(MAX_NAME_CHARS + 1);
        assert!(long.validate().is_err());

        let mut control = sample();
        control.folders[0].name = "a\u{0007}b".into();
        assert!(control.validate().is_err());
    }

    #[test]
    fn a_playlist_lives_in_one_folder_only() {
        let mut twice = sample();
        twice.folders[0].folders[0].playlists.push("p1".into());
        assert_eq!(twice.validate().unwrap_err(), "a playlist can only be in one folder");
        let mut bad_id = sample();
        bad_id.folders[0].playlists.push("../etc".into());
        assert!(bad_id.validate().is_err());
    }

    #[test]
    fn limits_nesting_depth() {
        let mut nested = folder("d7", &[], vec![]);
        for depth in (1..=6).rev() {
            nested = folder(&format!("d{depth}"), &[], vec![nested]);
        }
        let library = Library { folders: vec![nested], ..Library::default() };
        assert!(library.validate().unwrap_err().contains("nest"));
        let ok = Library { folders: vec![library.folders[0].folders[0].clone()], ..Library::default() };
        assert!(ok.validate().is_ok());
    }

    #[test]
    fn rejects_bad_tags_and_pins() {
        let mut dup_tag = sample();
        dup_tag.tags.insert("p2".into(), vec!["Chill".into(), "chill".into()]);
        assert!(dup_tag.validate().is_err());

        let mut long_tag = sample();
        long_tag.tags.insert("p2".into(), vec!["x".repeat(MAX_TAG_CHARS + 1)]);
        assert!(long_tag.validate().is_err());

        let mut many = sample();
        many.tags.insert("p2".into(), (0..=MAX_TAGS_PER_PLAYLIST).map(|i| format!("t{i}")).collect());
        assert!(many.validate().is_err());

        let mut dup_pin = sample();
        dup_pin.pins.push("p3".into());
        assert!(dup_pin.validate().is_err());

        let mut too_many_pins = sample();
        too_many_pins.pins = (0..=MAX_PINS).map(|i| format!("p{i}")).collect();
        assert!(too_many_pins.validate().is_err());
    }

    #[test]
    fn uses_camel_case_and_fills_missing_fields() {
        let parsed: Library = serde_json::from_str(r#"{"pins":["p9"]}"#).unwrap();
        assert_eq!(parsed.pins, vec!["p9"]);
        assert!(parsed.folders.is_empty());
        let json = serde_json::to_string(&sample()).unwrap();
        assert!(json.contains(r#""collapsed":false"#) && json.contains(r#""playlists":["p1"]"#));
    }

    #[test]
    fn saves_and_reads_back() {
        let file = temp_file("roundtrip");
        write_to(&file, &sample()).unwrap();
        assert_eq!(read_from(&file), sample());
        assert!(!file.with_extension("json.tmp").exists());
    }

    #[test]
    fn keeps_a_copy_of_a_corrupt_file() {
        let file = temp_file("corrupt");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "{ not json").unwrap();
        assert_eq!(read_from(&file), Library::default());
        assert_eq!(fs::read_to_string(file.with_extension("json.bak")).unwrap(), "{ not json");
        assert!(!file.exists());
    }

    #[test]
    fn missing_file_means_empty_library() {
        assert_eq!(read_from(&temp_file("missing")), Library::default());
    }
}
