//! The equalizer and boost for the players Carbon embeds: Spotify's Web Playback SDK and
//! YouTube's player. Off until the listener switches it on from Sound.
//!
//! - Both play inside cross-origin frames, so the only way to reach their audio is a script
//!   injected into every frame at document creation (`spotify_eq.js`). It acts only in those
//!   players' frames and stays dormant (it only notes which media elements have played) until
//!   Carbon's window sends "enable", so switching it on or off needs no restart.
//! - Spotify's audio is protected (EME). WebView2 decodes it in the page, where Web Audio can
//!   route it; engines that hand it to the system can't, and the script refuses there. Either
//!   way it watches for silence after routing, and the webview switches the feature off and
//!   reloads the player if that happens.
//! - Spotify can change its SDK at any time and break this, and altering a service's audio may
//!   conflict with its developer terms. The listener opts in from Sound.
use tauri::{App, WebviewWindow, WebviewWindowBuilder};

const SCRIPT: &str = include_str!("spotify_eq.js");
const PARENT_PLACEHOLDER: &str = "__CARBON_PARENT_ORIGIN__";
const PROD_ORIGIN: &str = "http://tauri.localhost";

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

/// Builds the main window from tauri.conf.json (which marks it `create: false`) so the all-frames
/// script can be attached. Every window setting still comes from the config.
pub fn create_main_window(app: &App) -> Result<WebviewWindow, Box<dyn std::error::Error>> {
    let config = app.config().app.windows.iter().find(|w| w.label == "main").ok_or("main window config missing")?.clone();
    Ok(WebviewWindowBuilder::from_config(app.handle(), &config)?.initialization_script_for_all_frames(script(&parent_origin(app))).build()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bakes_the_parent_origin_in_as_a_js_string() {
        let js = script("http://tauri.localhost");
        assert!(js.contains(r#"const PARENT = "http://tauri.localhost";"#));
        assert!(!js.contains(PARENT_PLACEHOLDER));
    }

    #[test]
    fn a_muted_player_is_never_mistaken_for_a_silenced_one() {
        assert!(SCRIPT.contains("if (el.paused || el.muted || el.volume === 0 || !config.enabled) return;"));
    }

    #[test]
    fn only_acts_inside_the_embedded_players() {
        let js = script("http://tauri.localhost");
        assert!(js.contains(r#"const PLAYERS = ["https://sdk.scdn.co", "https://www.youtube.com", "https://www.youtube-nocookie.com"];"#));
        assert!(js.contains("if (!PLAYERS.includes(location.origin) || window.top === window || window.parent !== window.top) return;"));
    }
}
