//! Keeps sign-in secrets in Windows Credential Manager, never on disk in plain text: the
//! Spotify refresh token and the Carbon account's app session token.
use keyring::Entry;

const SERVICE: &str = "com.pealz.carbon";
const SPOTIFY: &str = "spotify-refresh-token";
const CARBON: &str = "carbon-session";
const MAX_TOKEN_LEN: usize = 4096;

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|e| format!("credential store unavailable: {e}"))
}

/// Tokens are opaque single-line strings; anything else is a bug or an attack.
fn check(token: &str) -> Result<(), String> {
    if token.trim().is_empty() {
        return Err("refusing to save an empty token".into());
    }
    if token.len() > MAX_TOKEN_LEN || token.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("refusing to save a malformed token".into());
    }
    Ok(())
}

fn load(account: &str) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read saved sign-in: {e}")),
    }
}

fn save(account: &str, token: &str) -> Result<(), String> {
    check(token)?;
    entry(account)?
        .set_password(token)
        .map_err(|e| format!("could not save sign-in: {e}"))
}

fn clear(account: &str) -> Result<(), String> {
    match entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not remove saved sign-in: {e}")),
    }
}

#[tauri::command]
pub fn token_load() -> Result<Option<String>, String> {
    load(SPOTIFY)
}

#[tauri::command]
pub fn token_save(token: String) -> Result<(), String> {
    save(SPOTIFY, &token)
}

#[tauri::command]
pub fn token_clear() -> Result<(), String> {
    clear(SPOTIFY)
}

#[tauri::command]
pub fn carbon_token_load() -> Result<Option<String>, String> {
    load(CARBON)
}

#[tauri::command]
pub fn carbon_token_save(token: String) -> Result<(), String> {
    save(CARBON, &token)
}

#[tauri::command]
pub fn carbon_token_clear() -> Result<(), String> {
    clear(CARBON)
}

#[cfg(test)]
mod tests {
    use super::check;

    #[test]
    fn accepts_opaque_tokens() {
        assert!(check("AQDx-abc_123.def").is_ok());
    }

    #[test]
    fn rejects_empty_or_malformed_tokens() {
        assert!(check("").is_err());
        assert!(check("   ").is_err());
        assert!(check("two words").is_err());
        assert!(check("line\nbreak").is_err());
        assert!(check(&"x".repeat(5000)).is_err());
    }
}
