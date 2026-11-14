//! Things the listener keeps on this PC without telling any service: star ratings, bookmarks and
//! album collections. Each is one JSON file in the app data folder, validated on the way in and
//! written atomically; a file that can't be read is moved aside rather than overwritten.
use crate::history::{check_image, check_text, check_uri, Song};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const RATINGS_FILE: &str = "ratings.json";
const BOOKMARKS_FILE: &str = "bookmarks.json";
const COLLECTIONS_FILE: &str = "collections.json";
const FILES: [&str; 3] = [RATINGS_FILE, BOOKMARKS_FILE, COLLECTIONS_FILE];
const MAX_RATINGS: usize = 50_000;
const MAX_STARS: u8 = 5;
const MAX_BOOKMARKS: usize = 2_000;
const MAX_PATH_LEN: usize = 300;
const MAX_POSITION_MS: u64 = 24 * 60 * 60 * 1000;
const MAX_COLLECTIONS: usize = 200;
const MAX_ALBUMS: usize = 500;
const MAX_NAME_CHARS: usize = 100;
const MAX_ID_LEN: usize = 64;

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Rating {
    /// 1 to 5 once saved; 0 from the webview takes the rating away.
    pub stars: u8,
    pub at: u64,
    #[serde(flatten)]
    pub song: Song,
}

impl Rating {
    fn validate(&self) -> Result<(), String> {
        self.song.validate()?;
        if self.stars > MAX_STARS {
            return Err(format!("a rating is 0 to {MAX_STARS} stars"));
        }
        Ok(())
    }
}

fn check_ratings(ratings: &[Rating]) -> Result<(), String> {
    if ratings.len() > MAX_RATINGS {
        return Err(format!("Carbon keeps up to {MAX_RATINGS} ratings"));
    }
    let mut seen = HashSet::new();
    for rating in ratings {
        rating.validate()?;
        if rating.stars == 0 || !seen.insert(&rating.song.uri) {
            return Err(format!("\u{201c}{}\u{201d} has an invalid rating", rating.song.title));
        }
    }
    Ok(())
}

/// Sets, changes or (0 stars) removes one song's rating.
pub fn rate(mut ratings: Vec<Rating>, rating: Rating) -> Result<Vec<Rating>, String> {
    rating.validate()?;
    ratings.retain(|r| r.song.uri != rating.song.uri);
    if rating.stars > 0 {
        if ratings.len() >= MAX_RATINGS {
            return Err(format!("Carbon keeps up to {MAX_RATINGS} ratings"));
        }
        ratings.push(rating);
    }
    Ok(ratings)
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash, Debug)]
#[serde(rename_all = "lowercase")]
pub enum BookmarkKind {
    /// A page in Carbon: `target` is its route.
    Page,
    /// A moment in a song: `target` is the song's URI.
    Moment,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub kind: BookmarkKind,
    pub target: String,
    pub title: String,
    #[serde(default)]
    pub subtitle: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub position_ms: u64,
    #[serde(default)]
    pub duration_ms: u64,
    pub at: u64,
}

/// One of Carbon's own routes (`/album/…`), never an address elsewhere.
fn is_route(path: &str) -> bool {
    path.starts_with('/') && !path.starts_with("//") && path.len() <= MAX_PATH_LEN && !path.contains('\\') && path.chars().all(|c| c.is_ascii_graphic())
}

impl Bookmark {
    fn validate(&self) -> Result<(), String> {
        match self.kind {
            BookmarkKind::Page if !is_route(&self.target) => return Err("that isn't a page in Carbon".into()),
            BookmarkKind::Page => {}
            BookmarkKind::Moment => check_uri(&self.target)?,
        }
        check_text(&self.title, "a bookmark's name", true)?;
        check_text(&self.subtitle, "a bookmark's description", false)?;
        check_image(self.image.as_deref())?;
        if self.position_ms > MAX_POSITION_MS || self.duration_ms > MAX_POSITION_MS {
            return Err("that moment is outside the song".into());
        }
        Ok(())
    }
}

fn check_bookmarks(bookmarks: &[Bookmark]) -> Result<(), String> {
    if bookmarks.len() > MAX_BOOKMARKS {
        return Err(format!("Carbon keeps up to {MAX_BOOKMARKS} bookmarks"));
    }
    let mut seen = HashSet::new();
    for bookmark in bookmarks {
        bookmark.validate()?;
        if !seen.insert((bookmark.kind, &bookmark.target, bookmark.position_ms)) {
            return Err(format!("\u{201c}{}\u{201d} is bookmarked twice", bookmark.title));
        }
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub uri: String,
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub image: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub albums: Vec<Album>,
    #[serde(default)]
    pub updated_ms: u64,
}

impl Collection {
    fn validate(&self) -> Result<(), String> {
        let id_ok = !self.id.is_empty() && self.id.len() <= MAX_ID_LEN && self.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
        if !id_ok {
            return Err("that collection isn't valid".into());
        }
        check_text(&self.name, "a collection's name", true)?;
        if self.name.chars().count() > MAX_NAME_CHARS || self.name != self.name.trim() {
            return Err(format!("collection names need 1 to {MAX_NAME_CHARS} characters"));
        }
        if self.albums.len() > MAX_ALBUMS {
            return Err(format!("a collection holds up to {MAX_ALBUMS} albums"));
        }
        let mut seen = HashSet::new();
        for album in &self.albums {
            check_uri(&album.uri)?;
            check_text(&album.title, "an album's name", true)?;
            check_text(&album.artist, "an artist name", false)?;
            check_image(album.image.as_deref())?;
            if !seen.insert(&album.uri) {
                return Err(format!("\u{201c}{}\u{201d} is in \u{201c}{}\u{201d} twice", album.title, self.name));
            }
        }
        Ok(())
    }
}

fn check_collections(collections: &[Collection]) -> Result<(), String> {
    if collections.len() > MAX_COLLECTIONS {
        return Err(format!("Carbon keeps up to {MAX_COLLECTIONS} collections"));
    }
    let mut seen = HashSet::new();
    for collection in collections {
        collection.validate()?;
        if !seen.insert(&collection.id) {
            return Err(format!("\u{201c}{}\u{201d} is listed twice", collection.name));
        }
    }
    Ok(())
}

/// What must hold for a whole saved list, arriving from the webview or read back from disk.
trait Checked {
    fn check(&self) -> Result<(), String>;
}

impl Checked for Vec<Rating> {
    fn check(&self) -> Result<(), String> {
        check_ratings(self)
    }
}

impl Checked for Vec<Bookmark> {
    fn check(&self) -> Result<(), String> {
        check_bookmarks(self)
    }
}

impl Checked for Vec<Collection> {
    fn check(&self) -> Result<(), String> {
        check_collections(self)
    }
}

/// A corrupt or invalid file is moved aside to `<name>.json.bak` rather than overwritten.
fn read_from<T: DeserializeOwned + Default + Checked>(file: &Path) -> T {
    let Ok(text) = fs::read_to_string(file) else { return T::default() };
    match serde_json::from_str::<T>(&text).map_err(|e| e.to_string()).and_then(|doc| doc.check().map(|()| doc)) {
        Ok(doc) => doc,
        Err(e) => {
            let backup = file.with_extension("json.bak");
            eprintln!("[yours] {} is invalid ({e}); kept a copy at {}", file.display(), backup.display());
            if let Err(e) = fs::rename(file, &backup) {
                eprintln!("[yours] could not keep a copy: {e}");
            }
            T::default()
        }
    }
}

/// Writes atomically: a crash mid-save leaves the previous file intact.
fn write_to<T: Serialize>(file: &Path, doc: &T) -> Result<(), String> {
    let failed = |e: std::io::Error| format!("could not save that: {e}");
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(failed)?;
    }
    let tmp = file.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec(doc).map_err(|e| e.to_string())?).map_err(failed)?;
    fs::rename(&tmp, file).map_err(failed)
}

pub struct Yours {
    dir: Option<PathBuf>,
    /// One writer at a time: a rating is read, changed and written back.
    lock: Mutex<()>,
}

impl Yours {
    pub fn new(app: &AppHandle) -> Yours {
        Yours::at(app.path().app_data_dir().ok())
    }

    fn at(dir: Option<PathBuf>) -> Yours {
        Yours { dir, lock: Mutex::new(()) }
    }

    fn file(&self, name: &str) -> Result<PathBuf, String> {
        self.dir.as_ref().map(|d| d.join(name)).ok_or_else(|| "Carbon can't find its data folder".to_string())
    }

    fn get<T: DeserializeOwned + Default + Checked>(&self, name: &str) -> Result<T, String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        Ok(read_from(&self.file(name)?))
    }

    fn set<T: Serialize + Checked>(&self, name: &str, doc: T) -> Result<T, String> {
        doc.check()?;
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        write_to(&self.file(name)?, &doc)?;
        Ok(doc)
    }

    fn rate(&self, rating: Rating) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        let file = self.file(RATINGS_FILE)?;
        write_to(&file, &rate(read_from(&file), rating)?)
    }

    /// "Remove saved data": ratings, bookmarks, collections and any copies kept of unreadable ones.
    pub fn delete_data(&self) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        for name in FILES {
            let file = self.file(name)?;
            for path in [file.with_extension("json.bak"), file] {
                match fs::remove_file(&path) {
                    Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(format!("could not remove {}: {e}", path.display())),
                    _ => {}
                }
            }
        }
        Ok(())
    }
}

// `async`: the ratings file can hold 50,000 songs, so none of this runs on the main thread.
#[tauri::command(async)]
pub fn ratings_get(yours: State<Yours>) -> Result<Vec<Rating>, String> {
    yours.get(RATINGS_FILE)
}

#[tauri::command(async)]
pub fn rating_set(yours: State<Yours>, rating: Rating) -> Result<(), String> {
    yours.rate(rating)
}

#[tauri::command(async)]
pub fn bookmarks_get(yours: State<Yours>) -> Result<Vec<Bookmark>, String> {
    yours.get(BOOKMARKS_FILE)
}

#[tauri::command(async)]
pub fn bookmarks_set(yours: State<Yours>, bookmarks: Vec<Bookmark>) -> Result<Vec<Bookmark>, String> {
    yours.set(BOOKMARKS_FILE, bookmarks)
}

#[tauri::command(async)]
pub fn collections_get(yours: State<Yours>) -> Result<Vec<Collection>, String> {
    yours.get(COLLECTIONS_FILE)
}

#[tauri::command(async)]
pub fn collections_set(yours: State<Yours>, collections: Vec<Collection>) -> Result<Vec<Collection>, String> {
    yours.set(COLLECTIONS_FILE, collections)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TRACK: &str = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";

    fn rating(uri: &str, stars: u8) -> Rating {
        Rating { stars, at: 1, song: Song { uri: uri.into(), title: "Song".into(), artists: vec!["Band".into()], album: "Album".into(), image: None, duration_ms: 200_000 } }
    }

    fn page(path: &str) -> Bookmark {
        Bookmark { kind: BookmarkKind::Page, target: path.into(), title: "Kind of Blue".into(), subtitle: "Album".into(), image: Some("https://i.scdn.co/x".into()), position_ms: 0, duration_ms: 0, at: 1 }
    }

    fn moment(uri: &str, position_ms: u64) -> Bookmark {
        Bookmark { kind: BookmarkKind::Moment, target: uri.into(), position_ms, duration_ms: 300_000, ..page("/") }
    }

    fn album(uri: &str) -> Album {
        Album { uri: uri.into(), title: "Kind of Blue".into(), artist: "Miles Davis".into(), image: None }
    }

    fn collection(id: &str, name: &str, albums: Vec<Album>) -> Collection {
        Collection { id: id.into(), name: name.into(), albums, updated_ms: 1 }
    }

    fn temp(name: &str) -> (Yours, PathBuf) {
        let dir = std::env::temp_dir().join(format!("carbon-yours-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        (Yours::at(Some(dir.clone())), dir)
    }

    #[test]
    fn rates_changes_and_clears_a_song() {
        let list = rate(vec![], rating(TRACK, 4)).unwrap();
        let list = rate(list, rating("ytm:video:dQw4w9WgXcQ", 2)).unwrap();
        let list = rate(list, rating(TRACK, 5)).unwrap();
        assert_eq!(list.iter().map(|r| (r.song.uri.as_str(), r.stars)).collect::<Vec<_>>(), [("ytm:video:dQw4w9WgXcQ", 2), (TRACK, 5)]);
        assert!(check_ratings(&list).is_ok());
        assert_eq!(rate(list, rating(TRACK, 0)).unwrap().len(), 1);
    }

    #[test]
    fn refuses_bad_ratings_and_stops_at_the_cap() {
        assert!(rate(vec![], rating(TRACK, 6)).is_err());
        assert!(rate(vec![], rating("radio:station:x", 3)).is_err());
        assert!(check_ratings(&[rating(TRACK, 3), rating(TRACK, 4)]).is_err());
        assert!(check_ratings(&[rating(TRACK, 0)]).is_err());
        let full: Vec<Rating> = (0..MAX_RATINGS).map(|i| rating(&format!("ytm:video:v{i}"), 3)).collect();
        assert!(rate(full.clone(), rating(TRACK, 3)).is_err());
        // Changing or clearing one that's already there still works when full.
        assert_eq!(rate(full.clone(), rating("ytm:video:v0", 5)).unwrap().len(), MAX_RATINGS);
        assert_eq!(rate(full, rating("ytm:video:v0", 0)).unwrap().len(), MAX_RATINGS - 1);
    }

    #[test]
    fn bookmarks_are_carbon_pages_or_moments_in_songs() {
        let good = vec![page("/album/4uLU6hMCjMI75M1A2tKUQC"), page("/youtube/playlist/PL%20x?tab=1"), moment(TRACK, 61_000), moment(TRACK, 90_000)];
        assert!(check_bookmarks(&good).is_ok());
        let bad = [
            page("https://evil.example"),
            page("//evil.example/x"),
            page("album/x"),
            page("/a b"),
            page("/a\\b"),
            page(&format!("/{}", "x".repeat(MAX_PATH_LEN))),
            moment("/album/x", 0),
            moment("radio:station:x", 0),
            moment(TRACK, MAX_POSITION_MS + 1),
            Bookmark { title: " ".into(), ..page("/album/x") },
            Bookmark { image: Some("http://plain.example/a.jpg".into()), ..page("/album/x") },
        ];
        for b in bad {
            assert!(check_bookmarks(std::slice::from_ref(&b)).is_err(), "{b:?} should be refused");
        }
    }

    #[test]
    fn bookmarks_are_unique_and_capped() {
        assert!(check_bookmarks(&[page("/album/x"), page("/album/x")]).is_err());
        assert!(check_bookmarks(&[moment(TRACK, 5), moment(TRACK, 5)]).is_err());
        let many: Vec<Bookmark> = (0..=MAX_BOOKMARKS).map(|i| page(&format!("/album/{i}"))).collect();
        assert!(check_bookmarks(&many).is_err());
    }

    #[test]
    fn collections_need_names_ids_and_distinct_albums() {
        let good = vec![collection("a1b2-c3", "Sunday jazz", vec![album("spotify:album:1"), album("ytm:album:MPREb_1")]), collection("b", "Empty", vec![])];
        assert!(check_collections(&good).is_ok());
        let bad = [
            collection("", "No id", vec![]),
            collection("a/b", "Path id", vec![]),
            collection("a", "  ", vec![]),
            collection("a", " padded ", vec![]),
            collection("a", &"x".repeat(MAX_NAME_CHARS + 1), vec![]),
            collection("a", "Twice", vec![album("spotify:album:1"), album("spotify:album:1")]),
            collection("a", "Web", vec![album("https://evil.example")]),
            collection("a", "Untitled album", vec![Album { title: String::new(), ..album("spotify:album:1") }]),
            collection("a", "Too many", (0..=MAX_ALBUMS).map(|i| album(&format!("spotify:album:{i}"))).collect()),
        ];
        for c in bad {
            assert!(check_collections(std::slice::from_ref(&c)).is_err(), "{c:?} should be refused");
        }
        assert!(check_collections(&[collection("a", "One", vec![]), collection("a", "Two", vec![])]).is_err());
        let many: Vec<Collection> = (0..=MAX_COLLECTIONS).map(|i| collection(&i.to_string(), "Name", vec![])).collect();
        assert!(check_collections(&many).is_err());
    }

    #[test]
    fn uses_camel_case_and_fills_missing_fields() {
        let json = serde_json::to_string(&moment(TRACK, 5)).unwrap();
        assert!(json.contains(r#""kind":"moment""#) && json.contains(r#""positionMs":5"#));
        let json = serde_json::to_string(&rating(TRACK, 3)).unwrap();
        assert!(json.contains(r#""stars":3"#) && json.contains(r#""durationMs":200000"#) && !json.contains("song"));
        let old: Collection = serde_json::from_str(r#"{"id":"a","name":"Old"}"#).unwrap();
        assert!(old.albums.is_empty() && old.updated_ms == 0);
    }

    #[test]
    fn saves_reads_back_and_keeps_a_corrupt_copy() {
        let (yours, dir) = temp("roundtrip");
        yours.rate(rating(TRACK, 4)).unwrap();
        yours.rate(rating(TRACK, 5)).unwrap();
        assert_eq!(yours.get::<Vec<Rating>>(RATINGS_FILE).unwrap(), [rating(TRACK, 5)]);
        let saved = yours.set(BOOKMARKS_FILE, vec![page("/album/x")]).unwrap();
        assert_eq!(yours.get::<Vec<Bookmark>>(BOOKMARKS_FILE).unwrap(), saved);
        assert!(yours.set(BOOKMARKS_FILE, vec![page("nope")]).is_err());
        assert_eq!(yours.get::<Vec<Bookmark>>(BOOKMARKS_FILE).unwrap(), saved);

        fs::write(dir.join(COLLECTIONS_FILE), "{ not json").unwrap();
        assert!(yours.get::<Vec<Collection>>(COLLECTIONS_FILE).unwrap().is_empty());
        assert_eq!(fs::read_to_string(dir.join(COLLECTIONS_FILE).with_extension("json.bak")).unwrap(), "{ not json");

        yours.delete_data().unwrap();
        assert!(yours.get::<Vec<Rating>>(RATINGS_FILE).unwrap().is_empty());
        assert!(!dir.join(COLLECTIONS_FILE).with_extension("json.bak").exists());
        assert!(Yours::at(None).rate(rating(TRACK, 1)).is_err());
        let _ = fs::remove_dir_all(dir);
    }
}
