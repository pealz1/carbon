//! App info, uninstalling and removing saved data.
use crate::{blocklist, carbon_playlists, discord, engine, lastfm, library, library_tools, listenbrainz, local_library, settings, token_store, youtube};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const UNINSTALLER: &str = "uninstall.exe";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    installed: bool,
    discord_configured: bool,
    lastfm_configured: bool,
}

/// The NSIS installer drops uninstall.exe beside Carbon.exe; dev builds don't have one.
fn uninstaller() -> Option<PathBuf> {
    let path = std::env::current_exe().ok()?.parent()?.join(UNINSTALLER);
    path.exists().then_some(path)
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        installed: uninstaller().is_some(),
        discord_configured: discord::APP_ID.is_some(),
        lastfm_configured: lastfm::configured(),
    }
}

#[tauri::command]
pub fn uninstall(app: AppHandle) -> Result<(), String> {
    let path = uninstaller().ok_or("Carbon isn't installed (this is a development build)")?;
    std::process::Command::new(path).spawn().map_err(|e| format!("could not start the uninstaller: {e}"))?;
    app.exit(0);
    Ok(())
}

/// Signs out of Spotify, Carbon and Last.fm and deletes settings, folders, blocked songs, the local library
/// index, Carbon playlists, smart-playlist rules and cached metadata. Credential Manager entries survive an uninstall, so this is the
/// "leave nothing behind" option. Music files themselves are never touched.
#[tauri::command]
pub async fn remove_saved_data(app: AppHandle) -> Result<(), String> {
    token_store::token_clear()?;
    token_store::carbon_token_clear()?;
    lastfm::clear_session()?;
    listenbrainz::forget(&app)?;
    library::delete(&app)?;
    blocklist::delete(&app)?;
    engine::delete_data(&app)?;
    app.state::<local_library::LocalLibrary>().delete_data()?;
    app.state::<carbon_playlists::Store>().delete_data()?;
    app.state::<crate::history::History>().delete_data()?;
    app.state::<crate::yours::Yours>().delete_data()?;
    library_tools::delete(&app)?;
    youtube::forget(&app)?;
    crate::servers::clear_all()?;
    crate::providers::forget(&app.state::<crate::providers::Catalog>()).await?;
    forget_window_state(&app)?;
    settings::delete(&app)
}

/// What "Clear cache" may delete: notification artwork and the library tools' metadata. Local
/// library artwork stays (the index points at it), and so do loudness measurements (the analyzer
/// keeps them in memory and would write them straight back).
const CLEARABLE: [&str; 2] = ["notifications", library_tools::CACHE_DIR];

fn clearable(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    Ok(CLEARABLE.iter().map(|name| dir.join(name)).collect())
}

/// Bytes in a file or folder, following no links; whatever can't be read counts as nothing.
fn size_of(path: &std::path::Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if meta.is_file() {
        return meta.len();
    }
    if !meta.is_dir() {
        return 0;
    }
    std::fs::read_dir(path).map(|entries| entries.flatten().map(|e| size_of(&e.path())).sum()).unwrap_or(0)
}

/// Size of what "Clear cache" would delete (Settings → About & data).
#[tauri::command]
pub async fn cache_size(app: AppHandle) -> Result<u64, String> {
    Ok(clearable(&app)?.iter().map(|p| size_of(p)).sum())
}

#[tauri::command]
pub async fn cache_clear(app: AppHandle) -> Result<(), String> {
    clearable(&app)?.iter().try_for_each(|p| remove_path(p))
}

/// Remembered window positions (window-state plugin) and cached notification artwork.
fn forget_window_state(app: &AppHandle) -> Result<(), String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    remove_path(&config.join(tauri_plugin_window_state::DEFAULT_FILENAME))?;
    remove_path(&cache.join("notifications"))
}

/// Deletes a file or folder; one that's already gone is fine.
fn remove_path(path: &std::path::Path) -> Result<(), String> {
    let result = if path.is_dir() { std::fs::remove_dir_all(path) } else { std::fs::remove_file(path) };
    match result {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("couldn't delete {}: {e}", path.display())),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_folders_and_removes_them() {
        let dir = std::env::temp_dir().join(format!("carbon-cache-test-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("inner")).unwrap();
        std::fs::write(dir.join("a.bin"), [0u8; 10]).unwrap();
        std::fs::write(dir.join("inner").join("b.bin"), [0u8; 5]).unwrap();
        assert_eq!(size_of(&dir), 15);
        assert_eq!(size_of(&dir.join("missing")), 0);
        remove_path(&dir).unwrap();
        remove_path(&dir).unwrap(); // already gone is fine
        assert_eq!(size_of(&dir), 0);
    }
}
