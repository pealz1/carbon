//! App info, uninstalling and removing saved data.
use crate::{blocklist, carbon_playlists, discord, engine, lastfm, library, listenbrainz, local_library, settings, token_store, youtube};
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
/// index and Carbon playlists. Credential Manager entries survive an uninstall, so this is the
/// "leave nothing behind" option. Music files themselves are never touched.
#[tauri::command]
pub fn remove_saved_data(app: AppHandle) -> Result<(), String> {
    token_store::token_clear()?;
    token_store::carbon_token_clear()?;
    lastfm::clear_session()?;
    listenbrainz::forget(&app)?;
    library::delete(&app)?;
    blocklist::delete(&app)?;
    engine::delete_data(&app)?;
    app.state::<local_library::LocalLibrary>().delete_data()?;
    app.state::<carbon_playlists::Store>().delete_data()?;
    youtube::forget(&app)?;
    settings::delete(&app)
}
