//! EXPERIMENTAL: EQ on Spotify's audio. Off by default.
//!
//! Why it's experimental:
//! - Spotify's Web Playback SDK plays inside a cross-origin iframe (sdk.scdn.co). The only way
//!   to reach its audio is a script injected into every frame at document creation, which hooks
//!   the SDK's media element and routes it through Web Audio filters. Spotify can change the SDK
//!   at any time and break this.
//! - The SDK normally uses EME (Widevine). Web Audio can't process protected media: routing it
//!   produces silence. The script refuses to route elements with MediaKeys, watches for silence
//!   anyway, and the webview turns the feature off when it detects either.
//! - Altering Spotify's audio may conflict with Spotify's Developer Terms. The listener opts in
//!   from the Sound page, which says so.
//!
//! When the setting is off at startup the script is never injected, so normal playback can't be
//! affected. Even when injected it does nothing until the app window sends an "enable" message.
use tauri::{App, WebviewWindow, WebviewWindowBuilder};

const SCRIPT: &str = include_str!("spotify_eq.js");
const PARENT_PLACEHOLDER: &str = "__CARBON_PARENT_ORIGIN__";
const PROD_ORIGIN: &str = "http://tauri.localhost";

/// Whether the hook was injected into this run (it can only change on restart).
pub struct SpotifyEqInjected(pub bool);

fn parent_origin(app: &App) -> String {
    if tauri::is_dev()
        && let Some(url) = &app.config().build.dev_url
    {
        return url.origin().ascii_serialization();
    }
    PROD_ORIGIN.into()
}

pub fn script(parent_origin: &str) -> String {
    let quoted = serde_json::to_string(parent_origin).unwrap_or_else(|_| "\"\"".into());
    SCRIPT.replace(PARENT_PLACEHOLDER, &quoted)
}

/// Builds the main window from tauri.conf.json (which marks it `create: false`) so the optional
/// all-frames script can be attached. Every window setting still comes from the config.
pub fn create_main_window(app: &App, spotify_eq: bool) -> Result<WebviewWindow, Box<dyn std::error::Error>> {
    let config = app.config().app.windows.iter().find(|w| w.label == "main").ok_or("main window config missing")?.clone();
    let mut builder = WebviewWindowBuilder::from_config(app.handle(), &config)?;
    if spotify_eq {
        builder = builder.initialization_script_for_all_frames(script(&parent_origin(app)));
    }
    Ok(builder.build()?)
}

#[tauri::command]
pub fn sound_spotify_eq_injected(state: tauri::State<SpotifyEqInjected>) -> bool {
    state.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bakes_the_parent_origin_in_as_a_js_string() {
        let js = script("http://tauri.localhost");
        assert!(js.contains(r#"const PARENT = "http://tauri.localhost";"#));
        assert!(!js.contains(PARENT_PLACEHOLDER));
        assert!(js.contains(r#"location.origin !== "https://sdk.scdn.co""#));
    }
}
