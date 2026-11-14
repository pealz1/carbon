//! Songs and artists the listener never wants to hear, and whether to skip explicit songs. The
//! player skips them as they come on (Spotify and YouTube Music alike). Persisted as JSON in the
//! app config directory.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const FILE: &str = "blocklist.json";
const MAX_ITEMS: usize = 5_000;
const MAX_URI_LEN: usize = 128;
const MAX_NAME_CHARS: usize = 300;
const MAX_VERSIONS: usize = 30;
const MAX_VERSION_CHARS: usize = 40;
const MAX_SKIP_AFTER: u8 = 20;

/// Whether being in the listener's liked songs makes a song one to skip.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum LikeRule {
    #[default]
    Off,
    /// Skip what's already liked: for hearing something new.
    Liked,
    /// Skip what isn't liked: favourites only.
    Unliked,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Song,
    Artist,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Blocked {
    pub kind: Kind,
    /// Spotify or YouTube Music URI. Empty only for an artist without a page, matched by name.
    pub uri: String,
    pub name: String,
    /// Who a blocked song is by, for the list in Settings.
    #[serde(default)]
    pub by: String,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Blocklist {
    pub items: Vec<Blocked>,
    pub skip_explicit: bool,
    /// Words that mark a version to skip when a title's notes carry them: "live", "remix", "acoustic".
    pub skip_versions: Vec<String>,
    pub skip_by_like: LikeRule,
    /// Skip a song once the listener has skipped it this many times; 0 is off.
    pub skip_after: u8,
    /// Artist genres to skip ("country"), where the service says an artist's genres.
    pub skip_genres: Vec<String>,
}

/// `spotify:track:…` / `ytm:video:…` for songs, `spotify:artist:…` / `ytm:artist:…` for artists.
fn is_uri(uri: &str, kind: Kind) -> bool {
    let expected: &[&str] = match kind {
        Kind::Song => &["spotify:track:", "ytm:video:"],
        Kind::Artist => &["spotify:artist:", "ytm:artist:"],
    };
    let Some(id) = expected.iter().find_map(|prefix| uri.strip_prefix(prefix)) else { return false };
    uri.len() <= MAX_URI_LEN && !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn check_text(text: &str, what: &str, required: bool) -> Result<(), String> {
    if required && text.trim().is_empty() {
        return Err(format!("{what} can't be blank"));
    }
    if text.chars().count() > MAX_NAME_CHARS {
        return Err(format!("{what} must be {MAX_NAME_CHARS} characters or fewer"));
    }
    if text.chars().any(char::is_control) {
        return Err(format!("{what} can't contain control characters"));
    }
    Ok(())
}

/// A short list of short words the listener typed (versions, genres).
fn check_words(words: &[String], what: &str) -> Result<(), String> {
    if words.len() > MAX_VERSIONS {
        return Err(format!("you can skip at most {MAX_VERSIONS} {what}s"));
    }
    for word in words {
        check_text(word, &format!("a {what} to skip"), true)?;
        if word.chars().count() > MAX_VERSION_CHARS {
            return Err(format!("a {what} to skip must be {MAX_VERSION_CHARS} characters or fewer"));
        }
    }
    Ok(())
}

impl Blocked {
    /// What makes two entries the same: the URI, or the name for an artist without one.
    fn key(&self) -> (Kind, String) {
        let id = if self.uri.is_empty() { format!("name:{}", self.name.trim().to_lowercase()) } else { self.uri.clone() };
        (self.kind, id)
    }

    fn validate(&self) -> Result<(), String> {
        let uri_ok = if self.uri.is_empty() { self.kind == Kind::Artist } else { is_uri(&self.uri, self.kind) };
        if !uri_ok {
            return Err(format!("\u{201c}{}\u{201d} has an invalid link", self.name));
        }
        check_text(&self.name, "a blocked name", true)?;
        check_text(&self.by, "an artist name", false)
    }
}

impl Blocklist {
    /// Rejects anything Settings can't show instead of silently storing it.
    pub fn validate(&self) -> Result<(), String> {
        if self.items.len() > MAX_ITEMS {
            return Err(format!("you can block at most {MAX_ITEMS} songs and artists"));
        }
        let mut seen = HashSet::new();
        for item in &self.items {
            item.validate()?;
            if !seen.insert(item.key()) {
                return Err(format!("\u{201c}{}\u{201d} is blocked twice", item.name));
            }
        }
        check_words(&self.skip_versions, "version")?;
        check_words(&self.skip_genres, "genre")?;
        if self.skip_after > MAX_SKIP_AFTER {
            return Err(format!("\u{201c}skip after\u{201d} can be at most {MAX_SKIP_AFTER} skips"));
        }
        Ok(())
    }
}

pub struct BlocklistState(pub Mutex<Blocklist>);

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(FILE))
}

/// A corrupt or invalid file is moved aside to `blocklist.json.bak` rather than overwritten.
fn read_from(file: &Path) -> Blocklist {
    let Ok(text) = fs::read_to_string(file) else { return Blocklist::default() };
    match serde_json::from_str::<Blocklist>(&text).map_err(|e| e.to_string()).and_then(|b| b.validate().map(|()| b)) {
        Ok(list) => list,
        Err(e) => {
            let backup = file.with_extension("json.bak");
            eprintln!("[blocklist] {} is invalid ({e}); kept a copy at {}", file.display(), backup.display());
            if let Err(e) = fs::rename(file, &backup) {
                eprintln!("[blocklist] could not keep a copy: {e}");
            }
            Blocklist::default()
        }
    }
}

/// Writes atomically: a crash mid-save leaves the previous file intact.
fn write_to(file: &Path, list: &Blocklist) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("could not create the settings folder: {e}"))?;
    }
    let text = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    let tmp = file.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| format!("could not save your blocked songs: {e}"))?;
    fs::rename(&tmp, file).map_err(|e| format!("could not save your blocked songs: {e}"))
}

pub fn load(app: &AppHandle) -> Blocklist {
    path(app).map(|file| read_from(&file)).unwrap_or_default()
}

#[tauri::command]
pub fn blocklist_get(state: State<BlocklistState>) -> Result<Blocklist, String> {
    state.0.lock().map(|b| b.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn blocklist_set(app: AppHandle, state: State<BlocklistState>, blocklist: Blocklist) -> Result<Blocklist, String> {
    blocklist.validate()?;
    write_to(&path(&app)?, &blocklist)?;
    *state.0.lock().map_err(|e| e.to_string())? = blocklist.clone();
    Ok(blocklist)
}

/// Removes the file and forgets the list in memory (used by "remove saved data").
pub fn delete(app: &AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<BlocklistState>()
        && let Ok(mut list) = state.0.lock()
    {
        *list = Blocklist::default();
    }
    match fs::remove_file(path(app)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("could not remove your blocked songs: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(kind: Kind, uri: &str, name: &str) -> Blocked {
        Blocked { kind, uri: uri.into(), name: name.into(), by: String::new() }
    }

    fn sample() -> Blocklist {
        Blocklist {
            items: vec![
                item(Kind::Song, "spotify:track:4uLU6hMCjMI75M1A2tKUQC", "Song"),
                item(Kind::Artist, "spotify:artist:0OdUWJ0sBjDrqHygGUXeCF", "Band"),
                item(Kind::Song, "ytm:video:dQw4w9WgXcQ", "Video"),
                item(Kind::Artist, "", "Uploader"),
            ],
            skip_explicit: true,
            skip_versions: vec!["live".into(), "sped up".into()],
            skip_by_like: LikeRule::Liked,
            skip_after: 3,
            skip_genres: vec!["country".into()],
        }
    }

    #[test]
    fn bounds_the_versions_to_skip() {
        let with = |skip_versions: Vec<String>| Blocklist { skip_versions, ..Blocklist::default() };
        assert!(with(vec!["remix".into()]).validate().is_ok());
        assert!(with(vec!["  ".into()]).validate().is_err());
        assert!(with(vec!["x".repeat(MAX_VERSION_CHARS + 1)]).validate().is_err());
        assert!(with(vec!["live".into(); MAX_VERSIONS + 1]).validate().is_err());
        let old: Blocklist = serde_json::from_str(r#"{"items":[],"skipExplicit":true}"#).unwrap();
        assert!(old.skip_versions.is_empty());
        assert_eq!((old.skip_by_like, old.skip_after, old.skip_genres.len()), (LikeRule::Off, 0, 0));
        let rules: Blocklist = serde_json::from_str(r#"{"skipByLike":"unliked","skipAfter":5,"skipGenres":["metal"]}"#).unwrap();
        assert_eq!((rules.skip_by_like, rules.skip_after), (LikeRule::Unliked, 5));
        assert!(rules.validate().is_ok());
        assert!(Blocklist { skip_after: MAX_SKIP_AFTER + 1, ..Blocklist::default() }.validate().is_err());
        assert!(Blocklist { skip_genres: vec!["".into()], ..Blocklist::default() }.validate().is_err());
        assert!(serde_json::from_str::<Blocklist>(r#"{"skipByLike":"sometimes"}"#).is_err());
    }

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("carbon-blocklist-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join(FILE)
    }

    #[test]
    fn defaults_and_samples_are_valid() {
        assert!(Blocklist::default().validate().is_ok());
        assert!(sample().validate().is_ok());
    }

    #[test]
    fn rejects_bad_links_and_names() {
        let cases = [
            item(Kind::Song, "spotify:artist:abc", "artist link on a song"),
            item(Kind::Artist, "spotify:track:abc", "song link on an artist"),
            item(Kind::Song, "", "song without a link"),
            item(Kind::Song, "spotify:track:", "no id"),
            item(Kind::Song, "spotify:track:a/b", "slash"),
            item(Kind::Song, "https://evil.example", "web link"),
            item(Kind::Artist, "", "  "),
            item(Kind::Artist, "", "bell\u{0007}"),
            item(Kind::Artist, "", &"x".repeat(MAX_NAME_CHARS + 1)),
        ];
        for bad in cases {
            let list = Blocklist { items: vec![bad.clone()], skip_explicit: false, ..Blocklist::default() };
            assert!(list.validate().is_err(), "{bad:?} should be refused");
        }
    }

    #[test]
    fn refuses_duplicates_by_link_or_name() {
        let mut twice = sample();
        twice.items.push(item(Kind::Song, "spotify:track:4uLU6hMCjMI75M1A2tKUQC", "Same song"));
        assert!(twice.validate().is_err());
        let mut same_name = sample();
        same_name.items.push(item(Kind::Artist, "", " uploader "));
        assert!(same_name.validate().is_err());
        // A song and an artist may share a name.
        let mut song_named_like_artist = sample();
        song_named_like_artist.items.push(item(Kind::Song, "ytm:video:abc", "Uploader"));
        assert!(song_named_like_artist.validate().is_ok());
    }

    #[test]
    fn limits_the_list() {
        let many = Blocklist { items: (0..=MAX_ITEMS).map(|i| item(Kind::Song, &format!("ytm:video:v{i}"), "Song")).collect(), skip_explicit: false, ..Blocklist::default() };
        assert!(many.validate().is_err());
    }

    #[test]
    fn uses_camel_case_and_fills_missing_fields() {
        let parsed: Blocklist = serde_json::from_str(r#"{"skipExplicit":true}"#).unwrap();
        assert!(parsed.skip_explicit && parsed.items.is_empty());
        let json = serde_json::to_string(&sample()).unwrap();
        assert!(json.contains(r#""kind":"artist""#) && json.contains(r#""skipExplicit":true"#));
    }

    #[test]
    fn saves_reads_back_and_keeps_a_corrupt_copy() {
        let file = temp_file("roundtrip");
        write_to(&file, &sample()).unwrap();
        assert_eq!(read_from(&file), sample());
        fs::write(&file, "{ not json").unwrap();
        assert_eq!(read_from(&file), Blocklist::default());
        assert_eq!(fs::read_to_string(file.with_extension("json.bak")).unwrap(), "{ not json");
        assert_eq!(read_from(&temp_file("missing")), Blocklist::default());
    }
}
