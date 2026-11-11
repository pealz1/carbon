//! YouTube Music through its private web API (InnerTube). Requests are made here so the session
//! cookies never reach the webview; the webview gets the (de-noised) JSON and maps it to Carbon's
//! view models. Request shapes follow sigma67/ytmusicapi (MIT, see THIRD_PARTY_NOTICES.md).
//! Playback itself goes through YouTube's official embedded player in the webview.
mod auth;
mod client;
mod request;
pub mod signin;

pub use client::Youtube;

use request::{PlaylistEntry, SearchFilter};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

/// Why a video can or can't play, from the `player` endpoint. Only this part of that response is
/// ever read: Carbon doesn't touch stream data.
#[derive(Deserialize, Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Playability {
    #[serde(default)]
    status: String,
    reason: Option<String>,
    playable_in_embed: Option<bool>,
    /// The detail under `reason` ("…not available in your country"), when YouTube gives one.
    #[serde(default, skip_serializing, deserialize_with = "subreason")]
    error_screen: Option<String>,
}

impl Playability {
    /// One reason line for the webview: the headline plus the detail.
    fn merged(mut self) -> Self {
        let parts: Vec<String> = [self.reason.take(), self.error_screen.take()].into_iter().flatten().filter(|s| !s.is_empty()).collect();
        self.reason = (!parts.is_empty()).then(|| parts.join(" "));
        self
    }
}

fn subreason<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    let screen = Value::deserialize(d)?;
    let sub = screen.pointer("/playerErrorMessageRenderer/subreason");
    let runs = sub.and_then(|s| s.get("runs")).and_then(Value::as_array);
    let text = match runs {
        Some(runs) => runs.iter().filter_map(|r| r.get("text").and_then(Value::as_str)).collect::<String>(),
        None => sub.and_then(|s| s.get("simpleText")).and_then(Value::as_str).unwrap_or_default().to_string(),
    };
    Ok((!text.is_empty()).then_some(text))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerResponse {
    #[serde(default)]
    playability_status: Playability,
}

/// Edit endpoints answer 200 with a status; anything but success means the change didn't happen.
fn succeeded(response: &Value) -> Result<(), String> {
    match response.get("status").and_then(Value::as_str) {
        None | Some("STATUS_SUCCEEDED") => Ok(()),
        Some(other) => {
            eprintln!("[youtube] edit answered {other}");
            Err("YouTube Music didn't accept that change.".into())
        }
    }
}

/// Removes the saved session (Settings, "Remove everything").
pub fn forget(app: &AppHandle) -> Result<(), String> {
    auth::clear()?;
    app.state::<Youtube>().set_cookies(None);
    // Sync commands run on the main thread, where touching WebView2's cookies deadlocks.
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = signin::clear_profile(&app) {
            eprintln!("[youtube] {e}");
        }
    });
    Ok(())
}

/// Whether Carbon holds a YouTube Music session. Also refreshes the API's copy of the cookies from
/// the browser profile, where Google keeps rotating some of them.
#[tauri::command]
pub async fn ytm_signed_in(app: AppHandle, yt: State<'_, Youtube>) -> Result<bool, String> {
    let Some(saved) = yt.cookies()? else { return Ok(false) };
    if let Ok(Some(fresh)) = signin::profile_session(&app).await
        && fresh != saved
    {
        auth::save(&fresh)?;
        yt.set_cookies(Some(fresh));
    }
    Ok(true)
}

/// Signs out everywhere: Credential Manager, memory and Carbon's browser profile (the player).
#[tauri::command]
pub async fn ytm_sign_out(app: AppHandle, yt: State<'_, Youtube>) -> Result<(), String> {
    auth::clear()?;
    yt.set_cookies(None);
    tauri::async_runtime::spawn_blocking(move || signin::clear_profile(&app)).await.map_err(|e| e.to_string())?
}

/// The signed-in account's menu (name, handle, photo), or null when signed out.
#[tauri::command]
pub async fn ytm_account(yt: State<'_, Youtube>) -> Result<Value, String> {
    if yt.cookies()?.is_none() {
        return Ok(Value::Null);
    }
    yt.send(request::account()).await
}

#[tauri::command]
pub async fn ytm_search(yt: State<'_, Youtube>, query: String, filter: Option<SearchFilter>) -> Result<Value, String> {
    yt.send(request::search(&query, filter)?).await
}

#[tauri::command]
pub async fn ytm_browse(yt: State<'_, Youtube>, id: String, params: Option<String>) -> Result<Value, String> {
    yt.send(request::browse(&id, params.as_deref())?).await
}

#[tauri::command]
pub async fn ytm_browse_more(yt: State<'_, Youtube>, token: String) -> Result<Value, String> {
    yt.send(request::browse_more(&token)?).await
}

#[tauri::command]
pub async fn ytm_next(yt: State<'_, Youtube>, video_id: Option<String>, playlist_id: Option<String>, params: Option<String>) -> Result<Value, String> {
    yt.send(request::next(video_id.as_deref(), playlist_id.as_deref(), params.as_deref())?).await
}

#[tauri::command]
pub async fn ytm_playability(yt: State<'_, Youtube>, video_id: String) -> Result<Playability, String> {
    let bytes = yt.fetch(request::playability(&video_id)?).await?;
    let response: PlayerResponse = serde_json::from_slice(&bytes).map_err(|_| "YouTube Music sent something Carbon can't read.".to_string())?;
    Ok(response.playability_status.merged())
}

#[tauri::command]
pub async fn ytm_rate(yt: State<'_, Youtube>, video_id: String, like: bool) -> Result<(), String> {
    yt.send(request::rate(&video_id, like)?).await.map(drop)
}

/// Creates a private playlist and returns its id.
#[tauri::command]
pub async fn ytm_playlist_create(yt: State<'_, Youtube>, title: String, description: String, video_ids: Vec<String>) -> Result<String, String> {
    let response = yt.send(request::create_playlist(&title, &description, &video_ids)?).await?;
    response.get("playlistId").and_then(Value::as_str).map(str::to_string).ok_or_else(|| "YouTube Music didn't create the playlist.".into())
}

#[tauri::command]
pub async fn ytm_playlist_rename(yt: State<'_, Youtube>, playlist_id: String, title: String) -> Result<(), String> {
    succeeded(&yt.send(request::rename_playlist(&playlist_id, &title)?).await?)
}

#[tauri::command]
pub async fn ytm_playlist_add(yt: State<'_, Youtube>, playlist_id: String, video_ids: Vec<String>) -> Result<(), String> {
    succeeded(&yt.send(request::add_to_playlist(&playlist_id, &video_ids)?).await?)
}

#[tauri::command]
pub async fn ytm_playlist_remove(yt: State<'_, Youtube>, playlist_id: String, entries: Vec<PlaylistEntry>) -> Result<(), String> {
    succeeded(&yt.send(request::remove_from_playlist(&playlist_id, &entries)?).await?)
}

#[tauri::command]
pub async fn ytm_playlist_delete(yt: State<'_, Youtube>, playlist_id: String) -> Result<(), String> {
    yt.send(request::delete_playlist(&playlist_id)?).await.map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_only_the_playability_status() {
        let raw = json!({
            "playabilityStatus": { "status": "UNPLAYABLE", "reason": "Video unavailable", "playableInEmbed": false, "errorScreen": {} },
            "streamingData": { "formats": [{ "url": "https://example.invalid" }] },
        });
        let parsed: PlayerResponse = serde_json::from_value(raw).unwrap();
        let out = serde_json::to_value(parsed.playability_status).unwrap();
        assert_eq!(out, json!({ "status": "UNPLAYABLE", "reason": "Video unavailable", "playableInEmbed": false }));
        let empty: PlayerResponse = serde_json::from_value(json!({})).unwrap();
        assert_eq!(empty.playability_status, Playability::default());
    }

    #[test]
    fn adds_the_error_screens_detail_to_the_reason() {
        let raw = json!({ "playabilityStatus": {
            "status": "UNPLAYABLE",
            "reason": "Video unavailable",
            "errorScreen": { "playerErrorMessageRenderer": { "subreason": { "runs": [{ "text": "This video is not available in your country" }] } } },
        } });
        let parsed: PlayerResponse = serde_json::from_value(raw).unwrap();
        let out = serde_json::to_value(parsed.playability_status.merged()).unwrap();
        assert_eq!(out["reason"], "Video unavailable This video is not available in your country");
        let plain: PlayerResponse = serde_json::from_value(json!({ "playabilityStatus": { "status": "OK" } })).unwrap();
        assert_eq!(plain.playability_status.merged().reason, None);
    }

    #[test]
    fn checks_edit_status() {
        assert!(succeeded(&json!({ "status": "STATUS_SUCCEEDED" })).is_ok());
        assert!(succeeded(&json!({})).is_ok());
        assert!(succeeded(&json!({ "status": "STATUS_FAILED" })).is_err());
    }
}
