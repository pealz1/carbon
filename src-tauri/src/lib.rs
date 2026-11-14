mod bandcamp;
mod blocklist;
mod carbon_playlists;
pub mod cli;
mod discord;
mod engine;
mod fonts;
mod history;
mod hotkeys;
mod lastfm;
mod library;
mod listenbrainz;
mod library_tools;
mod links;
mod local_library;
mod lyrics_sources;
mod media_controls;
mod notifications;
mod oauth;
mod playback;
mod popouts;
mod radio;
mod remote;
mod servers;
mod settings;
mod soundcloud;
mod system;
mod taskbar;
mod token_store;
mod tray;
mod visibility;
mod yours;
mod youtube;

use blocklist::BlocklistState;
use discord::Discord;
use lastfm::Lastfm;
use library::LibraryState;
use listenbrainz::Listenbrainz;
use media_controls::MediaState;
use playback::PlaybackInfo;
use settings::SettingsState;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WindowEvent};
use tauri_plugin_window_state::StateFlags;
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
    app.state::<visibility::YoutubePlaying>().update(info.as_ref());
    app.state::<notifications::Notifier>().update(&app, info.as_ref());
    taskbar::set_playing(&app, info.as_ref().is_some_and(|i| !i.paused));
    tray.update(&app, info.as_ref());
    remote.publish(info.as_ref());
    app.state::<cli::StateFile>().update(info.as_ref());
    discord.send(discord::Msg::Playback(info.clone()));
    // A radio station isn't a song: nothing to scrobble, and no "now playing" in its name.
    let song = info.filter(|i| i.source != Some(playback::Source::Radio));
    app.state::<Listenbrainz>().send(listenbrainz::Msg::Playback(song.clone()));
    lastfm.send(lastfm::Msg::Playback(song));
    Ok(())
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let prefs = settings::load(&handle);
    app.manage(Discord::spawn(prefs.discord_presence));
    app.manage(Lastfm::spawn(prefs.lastfm_scrobbling));
    app.manage(Listenbrainz::spawn(prefs.listenbrainz_scrobbling, listenbrainz::queue_path(&handle)));
    let remote = remote::Remote::new(&handle);
    if prefs.remote_enabled
        && let Err(e) = remote.apply(true, prefs.remote_port)
    {
        eprintln!("[remote] {e}");
    }
    if let Err(e) = remote.apply_widgets(prefs.streamer_widgets) {
        eprintln!("[widgets] {e}");
    }
    app.manage(remote);
    app.manage(notifications::Notifier::default());
    app.manage(visibility::YoutubePlaying::default());
    app.manage(hotkeys::HotkeyState::default());
    hotkeys::apply(&handle, &prefs.hotkeys);
    app.manage(SettingsState(Mutex::new(prefs)));
    app.manage(LibraryState(Mutex::new(library::load(&handle))));
    app.manage(BlocklistState(Mutex::new(blocklist::load(&handle))));
    app.manage(tray::build(&handle)?);
    let sound = engine::sound::load(&handle);
    app.manage(local_library::LocalLibrary::load(&handle));
    app.manage(carbon_playlists::Store::load(&handle));
    app.manage(history::History::new(&handle));
    app.manage(yours::Yours::new(&handle));
    app.manage(youtube::Youtube::new());
    app.manage(radio::Radio::new(&app.package_info().version.to_string()));
    app.manage(lyrics_sources::LyricsSources::new());
    app.manage(servers::Servers::new(&app.package_info().version.to_string()));
    app.manage(soundcloud::SoundCloud::new(&app.package_info().version.to_string()));
    app.manage(bandcamp::Bandcamp::new(&app.package_info().version.to_string()));
    app.manage(engine::spotify_eq::SpotifyEqInjected(sound.spotify_eq));
    let window = engine::spotify_eq::create_main_window(app, sound.spotify_eq)?;
    app.manage(engine::Engine::spawn(&handle, sound));

    let media = MediaState::default();
    media.attach(&handle, &window);
    app.manage(media);
    taskbar::attach(&handle, &window);

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
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| cli::second_launch(app, &args)))
        .plugin(cli::plugin())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(hotkeys::handle).build())
        // Pop-outs come back where they were left; the main window keeps opening centred.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["main"])
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE)
                .build(),
        )
        .setup(setup)
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" && settings::current(window.app_handle()).close_to_tray => {
                api.prevent_close();
                if window.state::<visibility::YoutubePlaying>().get() {
                    visibility::hand_over(window, "close");
                } else {
                    let _ = window.hide();
                }
            }
            WindowEvent::Resized(_)
                if window.label() == "main" && window.state::<visibility::YoutubePlaying>().get() && window.is_minimized().unwrap_or(false) =>
            {
                visibility::hand_over(window, "minimize");
            }
            // Closing Carbon (close-to-tray off) closes the pop-outs too; they'd have no player to follow.
            WindowEvent::Destroyed if window.label() == "main" => window.app_handle().exit(0),
            WindowEvent::Destroyed if popouts::Popout::is_label(window.label()) => popouts::changed(window.app_handle(), Some(window.label())),
            _ => {}
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
            fonts::fonts_installed,
            library::library_get,
            library::library_set,
            blocklist::blocklist_get,
            blocklist::blocklist_set,
            lastfm::lastfm_status,
            lastfm::lastfm_connect,
            lastfm::lastfm_disconnect,
            listenbrainz::listenbrainz_status,
            listenbrainz::listenbrainz_connect,
            listenbrainz::listenbrainz_disconnect,
            remote::remote_status,
            remote::remote_rotate,
            remote::remote_disconnect,
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
            engine::engine_speed,
            engine::engine_spectrum,
            engine::sound_get,
            engine::sound_set,
            engine::sound_presets,
            engine::sound_curve,
            engine::sound_devices,
            engine::spotify_eq::sound_spotify_eq_injected,
            local_library::local_library_get,
            local_library::local_library_add_folder,
            local_library::local_library_remove_folder,
            local_library::local_library_rescan,
            local_library::local_library_tags,
            local_library::local_library_edit_tags,
            carbon_playlists::carbon_playlists,
            carbon_playlists::carbon_playlist_create,
            carbon_playlists::carbon_playlist_rename,
            carbon_playlists::carbon_playlist_delete,
            carbon_playlists::carbon_playlist_add,
            carbon_playlists::carbon_playlist_remove,
            carbon_playlists::carbon_playlist_move,
            carbon_playlists::carbon_playlist_replace,
            library_tools::tools_export,
            library_tools::tools_import,
            library_tools::tools_cache_get,
            library_tools::tools_cache_set,
            library_tools::smart_playlists_get,
            library_tools::smart_playlists_set,
            library_tools::backup_save,
            library_tools::backup_open,
            youtube::ytm_signed_in,
            youtube::signin::ytm_sign_in,
            youtube::ytm_sign_out,
            youtube::ytm_account,
            youtube::ytm_search,
            youtube::ytm_browse,
            youtube::ytm_browse_more,
            youtube::ytm_timed_lyrics,
            youtube::ytm_next,
            youtube::ytm_playability,
            youtube::ytm_rate,
            youtube::ytm_playlist_create,
            youtube::ytm_playlist_rename,
            youtube::ytm_playlist_add,
            youtube::ytm_playlist_remove,
            youtube::ytm_playlist_delete,
            radio::radio_stations,
            radio::radio_played,
            lyrics_sources::lyrics_netease_search,
            lyrics_sources::lyrics_netease_get,
            lyrics_sources::lyrics_musixmatch,
            lyrics_sources::lyrics_translate,
            lyrics_sources::lyrics_save,
            history::history_get,
            history::history_add,
            history::history_clear,
            history::history_paused,
            history::history_pause,
            yours::ratings_get,
            yours::rating_set,
            yours::bookmarks_get,
            yours::bookmarks_set,
            yours::collections_get,
            yours::collections_set,
            servers::server_connect,
            servers::server_disconnect,
            servers::servers_connected,
            servers::server_get,
            soundcloud::soundcloud_get,
            soundcloud::soundcloud_stream,
            bandcamp::bandcamp_search,
            bandcamp::bandcamp_release,
            bandcamp::bandcamp_band,
            bandcamp::bandcamp_stream,
            popouts::popout_open,
            popouts::popout_close,
            popouts::popouts_open,
            popouts::popout_command,
            hotkeys::hotkeys_status,
            hotkeys::hotkeys_suspend,
            cli::launch_link,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Carbon");
}
