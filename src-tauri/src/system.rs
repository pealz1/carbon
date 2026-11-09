//! App info, uninstalling and removing saved data.
use crate::{discord, lastfm, library, settings, token_store};
use serde::Serialize;
use std::path::PathBuf;
use tauri::AppHandle;

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

/// Signs out of Spotify and Last.fm and deletes settings and folders. Credential Manager entries
/// survive an uninstall, so this is the "leave nothing behind" option.
#[tauri::command]
pub fn remove_saved_data(app: AppHandle) -> Result<(), String> {
    token_store::token_clear()?;
    lastfm::clear_session()?;
    library::delete(&app)?;
    settings::delete(&app)
}
