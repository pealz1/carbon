//! Files and storage for the library tools: playlist export and import through the Windows file
//! dialogs (the webview never names a path), library backups, smart-playlist rules, and a small
//! expiring cache for Spotify metadata such as new releases (Spotify's terms only allow temporary
//! metadata caches).
use crate::carbon_playlists;
use crate::library::Library;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const SMART_FILE: &str = "smart-playlists.json";
const CACHE_DIR: &str = "library-cache";
const CACHE_KEYS: [&str; 1] = ["new-releases"];
const FORMATS: [(&str, &str, &str); 3] = [("csv", "csv", "CSV"), ("json", "json", "JSON"), ("m3u", "m3u8", "M3U playlist")];
const IMPORT_EXTENSIONS: [&str; 5] = ["csv", "json", "m3u", "m3u8", "txt"];
const MAX_EXPORT_BYTES: usize = 50 * 1024 * 1024;
const MAX_IMPORT_BYTES: u64 = 8 * 1024 * 1024;
const MAX_STORE_BYTES: usize = 8 * 1024 * 1024;
const MAX_TTL_SECS: u64 = 7 * 24 * 60 * 60;
const MAX_NAME_CHARS: usize = 120;
const BACKUP_VERSION: u64 = 1;
const MAX_BACKUP_BYTES: usize = 32 * 1024 * 1024;
const MAX_SAVED: usize = 100_000;
const MAX_BACKUP_PLAYLISTS: usize = 5_000;
const MAX_BACKUP_TRACKS: usize = 20_000;
const MAX_CARBON_PLAYLISTS: usize = 500;
const MAX_CARBON_ITEMS: usize = 10_000;
const MAX_SMART: usize = 500;
const MAX_BACKUP_TEXT: usize = 1_000;
const MAX_ENTRY_ARTISTS: usize = 100;
const MAX_ID_LEN: usize = 64;

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// A file name Windows accepts, from a playlist name.
pub fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { ' ' } else { c })
        .take(MAX_NAME_CHARS)
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.').trim();
    if trimmed.is_empty() { "Playlist".into() } else { trimmed.into() }
}

fn write_atomic(file: &Path, contents: &[u8]) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Couldn't save: {e}"))?;
    }
    let tmp = file.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| format!("Couldn't save: {e}"))?;
    fs::rename(&tmp, file).map_err(|e| format!("Couldn't save: {e}"))
}

fn remove_if_present(path: &Path) -> Result<(), String> {
    let result = if path.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) };
    match result {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("could not remove {}: {e}", path.display())),
        _ => Ok(()),
    }
}

/// Opens the save dialog and writes the export. Returns the chosen file's name, or None if cancelled.
#[tauri::command]
pub async fn tools_export(app: AppHandle, name: String, format: String, contents: String) -> Result<Option<String>, String> {
    let (_, extension, label) = FORMATS.iter().find(|(id, _, _)| *id == format).ok_or("Carbon can't export that format.")?;
    if contents.len() > MAX_EXPORT_BYTES {
        return Err("That export is too large to save.".into());
    }
    let picked = app
        .dialog()
        .file()
        .set_title("Export playlist")
        .set_file_name(format!("{}.{extension}", safe_file_name(&name)))
        .add_filter(*label, &[*extension])
        .blocking_save_file();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|_| "That location can't be written.".to_string())?;
    fs::write(&path, contents).map_err(|e| format!("Couldn't save the file: {e}"))?;
    Ok(path.file_name().map(|n| n.to_string_lossy().into_owned()))
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub name: String,
    pub extension: String,
    /// The file's folder, so relative paths in an M3U can be resolved.
    pub folder: String,
    pub text: String,
}

/// Reads a picked file as text: UTF-8 (a BOM is dropped), falling back to lossy decoding.
pub fn read_text(path: &Path) -> Result<Imported, String> {
    let extension = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !IMPORT_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Carbon imports CSV, JSON and M3U files.".into());
    }
    let size = fs::metadata(path).map_err(|e| format!("Couldn't open the file: {e}"))?.len();
    if size > MAX_IMPORT_BYTES {
        return Err("That file is too large to import.".into());
    }
    let bytes = fs::read(path).map_err(|e| format!("Couldn't open the file: {e}"))?;
    let body = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes);
    Ok(Imported {
        name: path.file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        extension,
        folder: path.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
        text: String::from_utf8_lossy(body).into_owned(),
    })
}

/// Opens the file picker for a playlist file. None if cancelled.
#[tauri::command]
pub async fn tools_import(app: AppHandle) -> Result<Option<Imported>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Import a playlist")
        .add_filter("Playlists", &IMPORT_EXTENSIONS)
        .blocking_pick_file();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|_| "That file can't be opened.".to_string())?;
    read_text(&path).map(Some)
}

// ——— Library backup ———
// One JSON file with the listener's library. It is checked here before it is written and again
// when it is read back: a backup is a file from disk, so nothing in it is trusted. The webview
// applies the same limits (src/lib/playlist-tools/backup-format.ts).

#[derive(Deserialize)]
struct BackupEntry {
    uri: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    artists: Vec<String>,
}

#[derive(Deserialize)]
struct BackupPlaylist {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    owner: String,
    tracks: Vec<BackupEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    app: String,
    kind: String,
    version: u64,
    created_at: String,
    liked: Vec<BackupEntry>,
    albums: Vec<BackupEntry>,
    artists: Vec<BackupEntry>,
    playlists: Vec<BackupPlaylist>,
    carbon_playlists: Vec<carbon_playlists::Playlist>,
    smart_playlists: Vec<serde_json::Value>,
    organizer: Library,
}

const NOT_A_BACKUP: &str = "That file isn't a Carbon library backup.";

fn invalid(what: &str) -> String {
    format!("That backup can't be used: {what}.")
}

fn plain(text: &str, max: usize) -> bool {
    text.chars().count() <= max && !text.chars().any(char::is_control)
}

/// Spotify ids are base-62.
fn is_spotify_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID_LEN && id.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// `spotify:<kind>:<id>` for one of `kinds`.
fn is_uri(uri: &str, kinds: &[&str]) -> bool {
    let mut parts = uri.splitn(3, ':');
    parts.next() == Some("spotify") && parts.next().is_some_and(|kind| kinds.contains(&kind)) && parts.next().is_some_and(is_spotify_id)
}

/// A local file inside a Spotify playlist. Kept for reading; Spotify's API can't put it back.
fn is_local_uri(uri: &str) -> bool {
    uri.strip_prefix("spotify:local:").is_some_and(|rest| plain(rest, MAX_BACKUP_TEXT))
}

fn check_entries(entries: &[BackupEntry], max: usize, kinds: &[&str], local: bool, what: &str) -> Result<(), String> {
    if entries.len() > max {
        return Err(invalid(&format!("it lists more {what} than Carbon accepts")));
    }
    let valid = |e: &BackupEntry| {
        (is_uri(&e.uri, kinds) || (local && is_local_uri(&e.uri)))
            && plain(&e.name, MAX_BACKUP_TEXT)
            && e.artists.len() <= MAX_ENTRY_ARTISTS
            && e.artists.iter().all(|a| plain(a, MAX_BACKUP_TEXT))
    };
    if entries.iter().all(valid) { Ok(()) } else { Err(invalid(&format!("one of its {what} has a link or text Carbon doesn't recognise"))) }
}

fn check_playlists(playlists: &[BackupPlaylist]) -> Result<(), String> {
    if playlists.len() > MAX_BACKUP_PLAYLISTS {
        return Err(invalid("it lists more playlists than Carbon accepts"));
    }
    for p in playlists {
        if !is_spotify_id(&p.id) || ![&p.name, &p.description, &p.owner].into_iter().all(|t| plain(t, MAX_BACKUP_TEXT)) {
            return Err(invalid("one of its playlists has an id or text Carbon doesn't recognise"));
        }
        check_entries(&p.tracks, MAX_BACKUP_TRACKS, &["track", "episode"], true, "playlist songs")?;
    }
    Ok(())
}

fn check_carbon(playlists: &[carbon_playlists::Playlist]) -> Result<(), String> {
    let valid = |p: &carbon_playlists::Playlist| {
        let id_ok = !p.id.is_empty() && p.id.len() <= MAX_ID_LEN && p.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        id_ok && carbon_playlists::clean_name(&p.name).is_ok() && p.items.len() <= MAX_CARBON_ITEMS
    };
    if playlists.len() <= MAX_CARBON_PLAYLISTS && playlists.iter().all(valid) { Ok(()) } else { Err(invalid("its Carbon playlists aren't valid")) }
}

/// Size, shape, version, counts and the form of every link and id in a backup.
pub fn check_backup(text: &str) -> Result<(), String> {
    if text.len() > MAX_BACKUP_BYTES {
        return Err(invalid("it's too large"));
    }
    let backup: Backup = serde_json::from_str(text).map_err(|_| NOT_A_BACKUP.to_string())?;
    if backup.app != "Carbon" || backup.kind != "library-backup" || backup.version == 0 {
        return Err(NOT_A_BACKUP.into());
    }
    if backup.version > BACKUP_VERSION {
        return Err("That backup was made by a newer Carbon. Update Carbon, then restore it.".into());
    }
    if backup.created_at.is_empty() || !plain(&backup.created_at, MAX_ID_LEN) {
        return Err(invalid("its date is missing"));
    }
    check_entries(&backup.liked, MAX_SAVED, &["track"], false, "liked songs")?;
    check_entries(&backup.albums, MAX_SAVED, &["album"], false, "albums")?;
    check_entries(&backup.artists, MAX_SAVED, &["artist"], false, "artists")?;
    check_playlists(&backup.playlists)?;
    check_carbon(&backup.carbon_playlists)?;
    if backup.smart_playlists.len() > MAX_SMART {
        return Err(invalid("it lists more smart playlists than Carbon accepts"));
    }
    backup.organizer.validate().map_err(|e| invalid(&e))
}

/// Reads a picked backup: a .json file within the size cap, in UTF-8, that passes `check_backup`.
pub fn read_backup(path: &Path) -> Result<String, String> {
    if !path.extension().is_some_and(|e| e.eq_ignore_ascii_case("json")) {
        return Err("Carbon backups are .json files.".into());
    }
    let size = fs::metadata(path).map_err(|e| format!("Couldn't open the file: {e}"))?.len();
    if size > MAX_BACKUP_BYTES as u64 {
        return Err(invalid("it's too large"));
    }
    let bytes = fs::read(path).map_err(|e| format!("Couldn't open the file: {e}"))?;
    let body = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes);
    let text = std::str::from_utf8(body).map_err(|_| NOT_A_BACKUP.to_string())?;
    check_backup(text)?;
    Ok(text.to_owned())
}

/// Opens the save dialog and writes a checked backup. Returns the file's name, or None if cancelled.
#[tauri::command]
pub async fn backup_save(app: AppHandle, name: String, contents: String) -> Result<Option<String>, String> {
    check_backup(&contents)?;
    let picked = app
        .dialog()
        .file()
        .set_title("Back up your library")
        .set_file_name(format!("{}.json", safe_file_name(&name)))
        .add_filter("Carbon backup", &["json"])
        .blocking_save_file();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|_| "That location can't be written.".to_string())?;
    write_atomic(&path, contents.as_bytes())?;
    Ok(path.file_name().map(|n| n.to_string_lossy().into_owned()))
}

/// Opens the file picker for a backup and returns its checked text. None if cancelled.
#[tauri::command]
pub async fn backup_open(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().set_title("Restore from a backup").add_filter("Carbon backup", &["json"]).blocking_pick_file();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|_| "That file can't be opened.".to_string())?;
    read_backup(&path).map(Some)
}

fn smart_file(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|d| d.join(SMART_FILE)).map_err(|e| e.to_string())
}

fn cache_file(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if !CACHE_KEYS.contains(&key) {
        return Err("unknown cache".into());
    }
    app.path().app_cache_dir().map(|d| d.join(CACHE_DIR).join(format!("{key}.json"))).map_err(|e| e.to_string())
}

/// Stored text must be JSON and of a sane size; the webview validates the shape when it reads it.
fn check_json(text: &str) -> Result<(), String> {
    if text.len() > MAX_STORE_BYTES {
        return Err("That's too much to save.".into());
    }
    serde_json::from_str::<serde_json::Value>(text).map(|_| ()).map_err(|_| "That isn't valid data.".into())
}

#[tauri::command]
pub fn smart_playlists_get(app: AppHandle) -> Result<Option<String>, String> {
    Ok(fs::read_to_string(smart_file(&app)?).ok())
}

#[tauri::command]
pub fn smart_playlists_set(app: AppHandle, json: String) -> Result<(), String> {
    check_json(&json)?;
    write_atomic(&smart_file(&app)?, json.as_bytes())
}

#[derive(Serialize, Deserialize)]
struct CacheEntry {
    expires_ms: u64,
    value: String,
}

/// The entry's value while it hasn't expired. An expired or unreadable entry is deleted.
pub fn cache_read(file: &Path, now: u64) -> Option<String> {
    let text = fs::read_to_string(file).ok()?;
    match serde_json::from_str::<CacheEntry>(&text) {
        Ok(entry) if entry.expires_ms > now => Some(entry.value),
        _ => {
            let _ = fs::remove_file(file);
            None
        }
    }
}

#[tauri::command]
pub fn tools_cache_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    Ok(cache_read(&cache_file(&app, &key)?, now_ms()))
}

#[tauri::command]
pub fn tools_cache_set(app: AppHandle, key: String, value: String, ttl_secs: u64) -> Result<(), String> {
    check_json(&value)?;
    let entry = CacheEntry { expires_ms: now_ms() + ttl_secs.min(MAX_TTL_SECS) * 1000, value };
    write_atomic(&cache_file(&app, &key)?, &serde_json::to_vec(&entry).map_err(|e| e.to_string())?)
}

/// "Remove saved data": smart-playlist rules and the metadata cache.
pub fn delete(app: &AppHandle) -> Result<(), String> {
    remove_if_present(&smart_file(app)?)?;
    remove_if_present(&app.path().app_cache_dir().map_err(|e| e.to_string())?.join(CACHE_DIR))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("carbon-tools-{}-{name}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn file_names_are_safe_for_windows() {
        assert_eq!(safe_file_name("Road: trip / 2024?"), "Road  trip   2024");
        assert_eq!(safe_file_name("   "), "Playlist");
        assert_eq!(safe_file_name("ends with dots..."), "ends with dots");
        assert_eq!(safe_file_name(&"x".repeat(300)).len(), MAX_NAME_CHARS);
    }

    #[test]
    fn reads_text_without_bom_and_rejects_other_files() {
        let dir = temp("read");
        let file = dir.join("Mix.m3u8");
        fs::write(&file, b"\xEF\xBB\xBF#EXTM3U\nsong.mp3").unwrap();
        let read = read_text(&file).unwrap();
        assert_eq!(read.text, "#EXTM3U\nsong.mp3");
        assert_eq!((read.name.as_str(), read.extension.as_str()), ("Mix", "m3u8"));
        assert_eq!(read.folder, dir.to_string_lossy());
        let exe = dir.join("tool.exe");
        fs::write(&exe, b"MZ").unwrap();
        assert!(read_text(&exe).is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn cache_entries_expire() {
        let dir = temp("cache");
        let file = dir.join("c.json");
        fs::write(&file, serde_json::to_vec(&CacheEntry { expires_ms: 100, value: "[1]".into() }).unwrap()).unwrap();
        assert_eq!(cache_read(&file, 50).as_deref(), Some("[1]"));
        assert_eq!(cache_read(&file, 150), None);
        assert!(!file.exists());
        let _ = fs::remove_dir_all(dir);
    }

    fn backup() -> serde_json::Value {
        let track = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";
        serde_json::json!({
            "app": "Carbon", "kind": "library-backup", "version": 1, "createdAt": "2026-11-13T10:00:00.000Z",
            "liked": [{ "uri": track, "name": "Song", "artists": ["Artist"] }],
            "albums": [{ "uri": "spotify:album:al1", "name": "Album", "artists": [] }],
            "artists": [{ "uri": "spotify:artist:ar1", "name": "Artist" }],
            "playlists": [{
                "id": "p1", "name": "Mine", "description": "", "public": false, "collaborative": false, "owned": true, "owner": "Me", "tracksRead": true,
                "tracks": [{ "uri": track, "name": "Song", "artists": [] }, { "uri": "spotify:local:Artist:Album:Song:120", "name": "File", "artists": [] }]
            }],
            "carbonPlaylists": [{ "id": "0123456789abcdef", "name": "Carbon mix", "items": [{ "kind": "local", "id": "0".repeat(32) }], "updatedMs": 5 }],
            "smartPlaylists": [{ "id": "s1", "name": "Recent" }],
            "organizer": { "folders": [{ "id": "f1", "name": "Rock", "playlists": ["p1"] }], "tags": { "p1": ["chill"] }, "pins": ["p1"] },
            "somethingNewer": true
        })
    }

    fn check(edit: impl FnOnce(&mut serde_json::Value)) -> Result<(), String> {
        let mut value = backup();
        edit(&mut value);
        check_backup(&value.to_string())
    }

    #[test]
    fn accepts_a_backup_and_ignores_fields_it_doesnt_know() {
        assert_eq!(check(|_| {}), Ok(()));
    }

    #[test]
    fn refuses_files_that_arent_backups() {
        assert_eq!(check_backup("{ nope").unwrap_err(), NOT_A_BACKUP);
        assert_eq!(check(|b| b["app"] = "Other".into()).unwrap_err(), NOT_A_BACKUP);
        assert_eq!(check(|b| b["kind"] = "playlist".into()).unwrap_err(), NOT_A_BACKUP);
        assert_eq!(check(|b| b["version"] = 0.into()).unwrap_err(), NOT_A_BACKUP);
        assert_eq!(check(|b| b["liked"] = serde_json::Value::Null).unwrap_err(), NOT_A_BACKUP);
        assert!(check(|b| b["version"] = 2.into()).unwrap_err().contains("newer Carbon"));
        assert!(check(|b| b["createdAt"] = "".into()).is_err());
        assert!(check_backup(&" ".repeat(MAX_BACKUP_BYTES + 1)).unwrap_err().contains("too large"));
    }

    #[test]
    fn refuses_links_ids_and_text_it_doesnt_recognise() {
        assert!(check(|b| b["liked"][0]["uri"] = "https://example.com/x".into()).is_err());
        assert!(check(|b| b["liked"][0]["uri"] = "spotify:album:al1".into()).is_err());
        assert!(check(|b| b["liked"][0]["uri"] = "spotify:local:a:b:c:1".into()).is_err());
        assert!(check(|b| b["albums"][0]["uri"] = "spotify:album:../../x".into()).is_err());
        assert!(check(|b| b["artists"][0]["uri"] = "spotify:artist:".into()).is_err());
        assert!(check(|b| b["artists"][0]["name"] = "a\u{0007}b".into()).is_err());
        assert!(check(|b| b["liked"][0]["name"] = "x".repeat(MAX_BACKUP_TEXT + 1).into()).is_err());
        assert!(check(|b| b["playlists"][0]["id"] = "p/1".into()).is_err());
        assert!(check(|b| b["playlists"][0]["tracks"][0]["uri"] = "spotify:artist:ar1".into()).is_err());
        assert!(check(|b| b["carbonPlaylists"][0]["id"] = "../x".into()).is_err());
        assert!(check(|b| b["carbonPlaylists"][0]["items"][0]["kind"] = "youtube".into()).is_err());
        assert!(check(|b| b["organizer"]["folders"][0]["id"] = "has space".into()).is_err());
        assert!(check(|b| b["organizer"]["pins"] = serde_json::json!(["p1", "p1"])).is_err());
    }

    #[test]
    fn refuses_more_than_it_accepts() {
        let many = |n: usize, item: serde_json::Value| serde_json::Value::Array(vec![item; n]);
        let song = backup()["liked"][0].clone();
        assert!(check(|b| b["playlists"][0]["tracks"] = many(MAX_BACKUP_TRACKS + 1, song.clone())).unwrap_err().contains("playlist songs"));
        assert!(check(|b| b["playlists"] = many(MAX_BACKUP_PLAYLISTS + 1, backup()["playlists"][0].clone())).is_err());
        assert!(check(|b| b["smartPlaylists"] = many(MAX_SMART + 1, serde_json::json!({}))).is_err());
        assert!(check(|b| b["carbonPlaylists"] = many(MAX_CARBON_PLAYLISTS + 1, backup()["carbonPlaylists"][0].clone())).is_err());
        assert!(check(|b| b["liked"][0]["artists"] = many(MAX_ENTRY_ARTISTS + 1, "A".into())).is_err());
    }

    #[test]
    fn backup_files_are_written_whole_and_checked_when_read() {
        let dir = temp("backup");
        let file = dir.join("Carbon library.json");
        let text = backup().to_string();
        write_atomic(&file, format!("\u{feff}{text}").as_bytes()).unwrap();
        assert_eq!(read_backup(&file).unwrap(), text);
        assert!(!file.with_extension("tmp").exists());

        let renamed = dir.join("Carbon library.txt");
        fs::write(&renamed, &text).unwrap();
        assert!(read_backup(&renamed).unwrap_err().contains(".json"));
        let other = dir.join("other.json");
        fs::write(&other, "[1, 2]").unwrap();
        assert_eq!(read_backup(&other).unwrap_err(), NOT_A_BACKUP);
        let binary = dir.join("binary.json");
        fs::write(&binary, [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(read_backup(&binary).unwrap_err(), NOT_A_BACKUP);
        assert!(read_backup(&dir.join("missing.json")).is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn only_json_is_stored() {
        assert!(check_json("{\"a\":1}").is_ok());
        assert!(check_json("not json").is_err());
        assert!(check_json(&format!("\"{}\"", "x".repeat(MAX_STORE_BYTES))).is_err());
    }
}
