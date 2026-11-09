//! Keeps the Spotify refresh token in Windows Credential Manager, never on disk in plain text.
use keyring::Entry;

const SERVICE: &str = "com.pealz.carbon";
const ACCOUNT: &str = "spotify-refresh-token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("credential store unavailable: {e}"))
}

#[tauri::command]
pub fn token_load() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read saved sign-in: {e}")),
    }
}

#[tauri::command]
pub fn token_save(token: String) -> Result<(), String> {
    if token.trim().is_empty() {
        return Err("refusing to save an empty token".into());
    }
    entry()?
        .set_password(&token)
        .map_err(|e| format!("could not save sign-in: {e}"))
}

#[tauri::command]
pub fn token_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not remove saved sign-in: {e}")),
    }
}
