//! Files and storage for the library tools: playlist export and import through the Windows file
//! dialogs (the webview never names a path), smart-playlist rules, and a small expiring cache for
//! Spotify metadata such as new releases (Spotify's terms only allow temporary metadata caches).
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

    #[test]
    fn only_json_is_stored() {
        assert!(check_json("{\"a\":1}").is_ok());
        assert!(check_json("not json").is_err());
        assert!(check_json(&format!("\"{}\"", "x".repeat(MAX_STORE_BYTES))).is_err());
    }
}
