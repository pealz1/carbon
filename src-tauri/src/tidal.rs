//! TIDAL's public Developer Platform. OAuth refresh credentials stay in the native keyring.
use crate::{soundcloud, token_store};
use reqwest::{Client, Method, RequestBuilder, Url};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{Duration, Instant};
use tauri::State;
use tokio::sync::Mutex;

const SESSION: &str = "tidal-oauth";
const TOKEN_URL: &str = "https://auth.tidal.com/v1/oauth2/token";
const API_URL: &str = "https://openapi.tidal.com/v2/";
const JSON_API: &str = "application/vnd.api+json";
const MAX_BODY: usize = 4 * 1024 * 1024;
pub(crate) const CALLBACK_URL: &str = "http://127.0.0.1:8888/tidal-callback";

#[derive(Deserialize)]
struct Tokens {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
}

pub(crate) struct Tidal {
    http: Client,
    access: Mutex<Option<(Instant, String)>>,
}

impl Tidal {
    pub(crate) fn new() -> Self {
        Self {
            http: Client::builder()
                .timeout(Duration::from_secs(20))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("TIDAL HTTP client"),
            access: Mutex::default(),
        }
    }

    async fn token(&self) -> Result<String, String> {
        let mut access = self.access.lock().await;
        if let Some((until, token)) = &*access
            && *until > Instant::now()
        {
            return Ok(token.clone());
        }
        let stored = token_store::load(SESSION)?.ok_or("Connect TIDAL first.")?;
        let (client_id, refresh): (String, String) =
            serde_json::from_str(&stored).map_err(|_| "Reconnect TIDAL in Carbon.")?;
        let tokens = exchange(self.http.post(TOKEN_URL).form(&[
            ("grant_type", "refresh_token"),
            ("client_id", &client_id),
            ("refresh_token", &refresh),
        ]))
        .await?;
        if let Some(rotated) = &tokens.refresh_token {
            save_session(&client_id, rotated)?;
        }
        let token = tokens.access_token.clone();
        *access = Some(cache(tokens));
        Ok(token)
    }

    async fn request(
        &self,
        method: Method,
        url: Url,
        body: Option<Value>,
    ) -> Result<Value, String> {
        let token = self.token().await?;
        let request = |token: &str| {
            let req = self
                .http
                .request(method.clone(), url.clone())
                .bearer_auth(token)
                .header("Accept", JSON_API);
            match &body {
                Some(body) => req.header("Content-Type", JSON_API).json(body),
                None => req,
            }
        };
        let mut response = request(&token)
            .send()
            .await
            .map_err(|_| "Could not reach TIDAL.")?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            let mut access = self.access.lock().await;
            if access.as_ref().is_some_and(|(_, cached)| cached == &token) {
                *access = None;
            }
            drop(access);
            response = request(&self.token().await?)
                .send()
                .await
                .map_err(|_| "Could not reach TIDAL.")?;
        }
        let bytes = soundcloud::body(Ok(response), "TIDAL", MAX_BODY).await?;
        if bytes.is_empty() {
            return Ok(Value::Null);
        }
        soundcloud::parse(&bytes, "TIDAL")
    }
}

async fn exchange(request: RequestBuilder) -> Result<Tokens, String> {
    let response = request
        .send()
        .await
        .map_err(|_| "Could not reach TIDAL authorization.")?;
    if matches!(response.status().as_u16(), 400 | 401 | 403) {
        return Err("TIDAL rejected the sign-in. Check your app registration and requested permissions, then connect again.".into());
    }
    let bytes = soundcloud::body(Ok(response), "TIDAL authorization", 32 * 1024).await?;
    serde_json::from_slice::<Tokens>(&bytes)
        .ok()
        .filter(|tokens| !tokens.access_token.is_empty() && tokens.expires_in > 0)
        .ok_or_else(|| "TIDAL returned an invalid sign-in response.".into())
}

fn save_session(client_id: &str, refresh: &str) -> Result<(), String> {
    let session = serde_json::to_string(&(client_id, refresh)).map_err(|e| e.to_string())?;
    token_store::save(SESSION, &session)
}

fn cache(tokens: Tokens) -> (Instant, String) {
    (
        Instant::now() + Duration::from_secs(tokens.expires_in.min(86_400).saturating_sub(20)),
        tokens.access_token,
    )
}

#[tauri::command]
pub(crate) fn tidal_connected() -> Result<bool, String> {
    Ok(token_store::load(SESSION)?.is_some())
}

#[tauri::command]
pub(crate) async fn tidal_authorize(
    tidal: State<'_, Tidal>,
    client_id: String,
    code: String,
    verifier: String,
) -> Result<(), String> {
    let valid = |s: &str, min: usize, max: usize| {
        (min..=max).contains(&s.len())
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-._~".contains(&b))
    };
    if !valid(&client_id, 1, 128)
        || !valid(&verifier, 43, 128)
        || code.is_empty()
        || code.len() > 2048
    {
        return Err("TIDAL sign-in information is invalid.".into());
    }
    let mut access = tidal.access.lock().await;
    let tokens = exchange(tidal.http.post(TOKEN_URL).form(&[
        ("grant_type", "authorization_code"),
        ("client_id", &client_id),
        ("code", &code),
        ("redirect_uri", CALLBACK_URL),
        ("code_verifier", &verifier),
    ]))
    .await?;
    let refresh = tokens
        .refresh_token
        .as_deref()
        .ok_or("TIDAL did not provide a refresh credential.")?;
    save_session(&client_id, refresh)?;
    *access = Some(cache(tokens));
    Ok(())
}

#[tauri::command]
pub(crate) async fn tidal_disconnect(tidal: State<'_, Tidal>) -> Result<(), String> {
    let mut access = tidal.access.lock().await;
    token_store::clear(SESSION)?;
    *access = None;
    Ok(())
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Read {
    Search { query: String },
    OwnedPlaylists,
    SavedPlaylists,
    SavedTracks,
    PlaylistTracks { id: String },
    AlbumTracks { id: String },
    ArtistAlbums { id: String },
}

fn api_url(segments: &[&str]) -> Url {
    let mut url = Url::parse(API_URL).expect("valid TIDAL URL");
    url.path_segments_mut()
        .expect("TIDAL URL has a host")
        .pop_if_empty()
        .extend(segments);
    url
}

fn playlist_id(id: &str) -> Result<(), String> {
    if id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
    {
        Ok(())
    } else {
        Err("Invalid TIDAL playlist ID.".into())
    }
}

fn read_url(operation: Read, cursor: Option<&str>) -> Result<Url, String> {
    let mut url = match operation {
        Read::Search { query } => {
            let query = query.trim();
            if query.is_empty() || query.len() > 400 || query.chars().any(char::is_control) {
                return Err("Enter a TIDAL search under 400 bytes.".into());
            }
            let mut url = api_url(&["searchResults"]);
            url.query_pairs_mut().append_pair("filter[query]", query)
                .append_pair("include", "tracks.artists,tracks.albums.coverArt,albums.artists,albums.coverArt,artists.profileArt,playlists.coverArt");
            return Ok(url);
        }
        Read::OwnedPlaylists => {
            let mut url = api_url(&["playlists"]);
            url.query_pairs_mut()
                .append_pair("filter[owners.id]", "me")
                .append_pair("include", "coverArt");
            url
        }
        Read::SavedPlaylists => collection_url("userCollectionPlaylists", "items.coverArt"),
        Read::SavedTracks => collection_url(
            "userCollectionTracks",
            "items.artists,items.albums.coverArt",
        ),
        Read::PlaylistTracks { id } => {
            playlist_id(&id)?;
            items_url("playlists", &id)
        }
        Read::AlbumTracks { id } => {
            soundcloud::check_id(&id)?;
            items_url("albums", &id)
        }
        Read::ArtistAlbums { id } => {
            soundcloud::check_id(&id)?;
            let mut url = api_url(&["artists", &id, "relationships", "albums"]);
            url.query_pairs_mut()
                .append_pair("include", "albums.artists,albums.coverArt");
            url
        }
    };
    if let Some(cursor) = cursor {
        if cursor.is_empty() || cursor.len() > 2048 || cursor.chars().any(char::is_control) {
            return Err("Invalid TIDAL page cursor.".into());
        }
        url.query_pairs_mut().append_pair("page[cursor]", cursor);
    }
    Ok(url)
}

fn collection_url(collection: &str, includes: &str) -> Url {
    let mut url = api_url(&[collection, "me", "relationships", "items"]);
    url.query_pairs_mut().append_pair("include", includes);
    url
}

fn items_url(kind: &str, id: &str) -> Url {
    let mut url = api_url(&[kind, id, "relationships", "items"]);
    url.query_pairs_mut()
        .append_pair("include", "items.artists,items.albums.coverArt");
    url
}

#[tauri::command]
pub(crate) async fn tidal_read(
    tidal: State<'_, Tidal>,
    operation: Read,
    cursor: Option<String>,
) -> Result<Value, String> {
    tidal
        .request(Method::GET, read_url(operation, cursor.as_deref())?, None)
        .await
}

#[tauri::command]
pub(crate) async fn tidal_create_playlist(
    tidal: State<'_, Tidal>,
    name: String,
) -> Result<Value, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 250 || name.chars().any(char::is_control) {
        return Err("Enter a playlist name under 250 characters.".into());
    }
    tidal.request(Method::POST, api_url(&["playlists"]), Some(json!({
        "data": { "type": "playlists", "attributes": { "name": name, "accessType": "UNLISTED" } }
    }))).await
}

#[tauri::command]
pub(crate) async fn tidal_edit_playlist_track(
    tidal: State<'_, Tidal>,
    playlist: String,
    track: String,
    item_id: Option<String>,
) -> Result<(), String> {
    playlist_id(&playlist)?;
    soundcloud::check_id(&track)?;
    let mut item = json!({ "type": "tracks", "id": track });
    let method = if let Some(item_id) = item_id {
        if item_id.is_empty() || item_id.len() > 36 || item_id.chars().any(char::is_control) {
            return Err("Invalid TIDAL playlist item ID.".into());
        }
        item["meta"] = json!({ "itemId": item_id });
        Method::DELETE
    } else {
        Method::POST
    };
    let url = api_url(&["playlists", &playlist, "relationships", "items"]);
    tidal
        .request(method, url, Some(json!({ "data": [item] })))
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tidal_search_and_cursor_cannot_change_the_request_host() {
        let url = read_url(
            Read::Search {
                query: "new & old? #tunes".into(),
            },
            None,
        )
        .unwrap();
        assert_eq!(url.host_str(), Some("openapi.tidal.com"));
        assert_eq!(
            url.query_pairs()
                .find(|(key, _)| key == "filter[query]")
                .unwrap()
                .1,
            "new & old? #tunes"
        );
        let url = read_url(Read::OwnedPlaylists, Some("x&filter[owners.id]=else")).unwrap();
        let query: Vec<_> = url.query_pairs().collect();
        assert_eq!(query[0].1, "me");
        assert_eq!(query[2].1, "x&filter[owners.id]=else");
        assert!(
            read_url(
                Read::PlaylistTracks {
                    id: "../users/me".into()
                },
                None
            )
            .is_err()
        );
    }
}
