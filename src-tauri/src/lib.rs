mod carbon_playlists;
mod discord;
mod engine;
mod lastfm;
mod library;
mod media_controls;
mod oauth;
mod playback;
mod settings;
mod system;
mod token_store;
mod tray;

use discord::Discord;
use lastfm::Lastfm;
use media_controls::MediaState;
use playback::PlaybackInfo;
use settings::SettingsState;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WindowEvent};
use tray::TrayState;

const MINIMIZED_ARG: &str = "--minimized";

/// Single entry point for "what's playing" from the webview player.
#[tauri::command]
fn playback_update(
    app: AppHandle,
    info: Option<PlaybackInfo>,
    media: State<MediaState>,
    tray: State<TrayState>,
    discord: State<Discord>,
    lastfm: State<Lastfm>,
) -> Result<(), String> {
    if let Some(info) = &info {
        info.validate()?;
    }
    media.update(info.as_ref());
    tray.update(&app, info.as_ref());
    discord.send(discord::Msg::Playback(info.clone()));
    lastfm.send(lastfm::Msg::Playback(info));
    Ok(())
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let prefs = settings::load(&handle);
    app.manage(Discord::spawn(prefs.discord_presence));
    app.manage(Lastfm::spawn(prefs.lastfm_scrobbling));
    app.manage(SettingsState(Mutex::new(prefs)));
    app.manage(tray::build(&handle)?);
    let sound = engine::sound::load(&handle);
    app.manage(library::Library::load(&handle));
    app.manage(carbon_playlists::Store::load(&handle));
    app.manage(engine::spotify_eq::SpotifyEqInjected(sound.spotify_eq));
    let window = engine::spotify_eq::create_main_window(app, sound.spotify_eq)?;
    app.manage(engine::Engine::spawn(&handle, sound));

    let media = MediaState::default();
    media.attach(&handle, &window);
    app.manage(media);

    // Launched at login with --minimized: stay in the tray until the user opens Carbon.
    if !std::env::args().any(|a| a == MINIMIZED_ARG) {
        window.show()?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch focuses the running Carbon instead of starting another.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(setup)
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event
                && settings::current(window.app_handle()).close_to_tray
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            playback_update,
            oauth::wait_for_oauth_redirect,
            token_store::token_load,
            token_store::token_save,
            token_store::token_clear,
            settings::settings_get,
            settings::settings_set,
            lastfm::lastfm_status,
            lastfm::lastfm_connect,
            lastfm::lastfm_disconnect,
            system::app_info,
            system::uninstall,
            system::remove_saved_data,
            engine::engine_play,
            engine::engine_pause,
            engine::engine_resume,
            engine::engine_stop,
            engine::engine_seek,
            engine::engine_volume,
            engine::engine_repeat,
            engine::sound_get,
            engine::sound_set,
            engine::sound_presets,
            engine::sound_curve,
            engine::sound_devices,
            engine::spotify_eq::sound_spotify_eq_injected,
            library::library_get,
            library::library_add_folder,
            library::library_remove_folder,
            library::library_rescan,
            carbon_playlists::carbon_playlists,
            carbon_playlists::carbon_playlist_create,
            carbon_playlists::carbon_playlist_rename,
            carbon_playlists::carbon_playlist_delete,
            carbon_playlists::carbon_playlist_add,
            carbon_playlists::carbon_playlist_remove,
            carbon_playlists::carbon_playlist_move,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Carbon");
}
