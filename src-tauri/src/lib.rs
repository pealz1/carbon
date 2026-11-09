mod discord;
mod lastfm;
mod library;
mod media_controls;
mod oauth;
mod playback;
mod remote;
mod settings;
mod system;
mod token_store;
mod tray;

use discord::Discord;
use lastfm::Lastfm;
use library::LibraryState;
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
    remote: State<remote::Remote>,
) -> Result<(), String> {
    if let Some(info) = &info {
        info.validate()?;
    }
    media.update(info.as_ref());
    tray.update(&app, info.as_ref());
    remote.publish(info.as_ref());
    discord.send(discord::Msg::Playback(info.clone()));
    lastfm.send(lastfm::Msg::Playback(info));
    Ok(())
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let prefs = settings::load(&handle);
    app.manage(Discord::spawn(prefs.discord_presence));
    app.manage(Lastfm::spawn(prefs.lastfm_scrobbling));
    let remote = remote::Remote::new(&handle);
    if prefs.remote_enabled
        && let Err(e) = remote.apply(true, prefs.remote_port)
    {
        eprintln!("[remote] {e}");
    }
    app.manage(remote);
    app.manage(SettingsState(Mutex::new(prefs)));
    app.manage(LibraryState(Mutex::new(library::load(&handle))));
    app.manage(tray::build(&handle)?);

    let media = MediaState::default();
    let window = app.get_webview_window("main").ok_or("main window missing")?;
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
            oauth::wait_for_carbon_redirect,
            token_store::token_load,
            token_store::token_save,
            token_store::token_clear,
            token_store::carbon_token_load,
            token_store::carbon_token_save,
            token_store::carbon_token_clear,
            settings::settings_get,
            settings::settings_set,
            library::library_get,
            library::library_set,
            lastfm::lastfm_status,
            lastfm::lastfm_connect,
            lastfm::lastfm_disconnect,
            remote::remote_status,
            remote::remote_rotate,
            remote::remote_disconnect,
            system::app_info,
            system::uninstall,
            system::remove_saved_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Carbon");
}
