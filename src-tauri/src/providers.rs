//! Public provider APIs and isolated first-party players. No remote player has Carbon IPC permissions.
use crate::token_store;
use reqwest::{Client, RequestBuilder, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Mutex;

const SC_APP: &str = "soundcloud-api-app";
const SC_SESSION: &str = "soundcloud-api-refresh";
const SC_CALLBACK: &str = "http://127.0.0.1:8888/soundcloud-callback";
const SC_TOKEN: &str = "https://secure.soundcloud.com/oauth/token";
const APPLE_TOKEN: &str = "apple-music-developer-token";
const APPLE_API: &str = "https://api.music.apple.com";
const MAX_BODY: usize = 8 * 1024 * 1024;
/// Tidal's share pages are about 10 KB; anything far larger isn't one.
const MAX_PAGE: usize = 512 * 1024;
const TIDAL_HOSTS: &[&str] = &["tidal.com"];
const TIDAL_IMAGES: &[&str] = &["resources.tidal.com"];
const TIDAL_REDIRECTS: usize = 3;
const MAX_NAME: usize = 300;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Apple,
    Deezer,
    Soundcloud,
    Mixcloud,
    Archive,
}
impl Provider {
    fn name(self) -> &'static str {
        match self {
            Self::Apple => "Apple Music",
            Self::Deezer => "Deezer",
            Self::Soundcloud => "SoundCloud",
            Self::Mixcloud => "Mixcloud",
            Self::Archive => "Internet Archive",
        }
    }
    fn hosts(self) -> &'static [&'static str] {
        match self {
            Self::Apple => {
                &["music.apple.com", "account.apple.com", "appleid.apple.com", "idmsa.apple.com", "authorize.music.apple.com"]
            }
            Self::Deezer => &["www.deezer.com", "deezer.com", "connect.deezer.com", "account.deezer.com"],
            Self::Soundcloud => &["soundcloud.com", "www.soundcloud.com", "secure.soundcloud.com", "account.soundcloud.com"],
            Self::Mixcloud => &["www.mixcloud.com", "mixcloud.com"],
            Self::Archive => &["archive.org", "www.archive.org"],
        }
    }
}

fn allowed(url: &Url, hosts: &[&str]) -> bool {
    url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str().is_some_and(|h| hosts.contains(&h))
}

pub struct Catalog {
    http: Client,
    soundcloud: Mutex<Option<(Instant, String)>>,
    soundcloud_playlist_edits: Mutex<()>,
}
impl Catalog {
    pub fn new() -> Self {
        Self {
            http: Client::builder()
                .timeout(Duration::from_secs(20))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("create provider HTTP client"),
            soundcloud: Mutex::default(),
            soundcloud_playlist_edits: Mutex::default(),
        }
    }
    async fn soundcloud_token(&self) -> Result<String, String> {
        let mut cached = self.soundcloud.lock().await;
        if let Some((end, token)) = &*cached
            && *end > Instant::now()
        {
            return Ok(token.clone());
        }
        let (id, secret) = sc_app()?;
        let refresh = token_store::load(SC_SESSION)?;
        let request = if let Some(refresh) = refresh.as_deref() {
            self.http.post(SC_TOKEN).form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh),
                ("client_id", &id),
                ("client_secret", &secret),
            ])
        } else {
            self.http.post(SC_TOKEN).basic_auth(&id, Some(&secret)).form(&[("grant_type", "client_credentials")])
        };
        let response = json(request, "SoundCloud authorization").await?;
        let entry = sc_token(&response, refresh.is_some())?;
        let token = entry.1.clone();
        *cached = Some(entry);
        Ok(token)
    }
}
fn sc_app() -> Result<(String, String), String> {
    let value = token_store::load(SC_APP)?
        .ok_or("Connect a registered SoundCloud app in provider settings, or open the SoundCloud player.")?;
    serde_json::from_str(&value).map_err(|_| "Reconnect the SoundCloud app in provider settings.".into())
}
fn apple_token() -> Result<String, String> {
    token_store::load(APPLE_TOKEN)?
        .ok_or("Connect an Apple Music developer token in Apple Music provider settings to load catalog playlists.".into())
}
fn apple_token_valid(token: &str) -> bool {
    token.len() <= 4096
        && token.split('.').count() == 3
        && token.split('.').all(|part| {
            !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-_".contains(&byte))
        })
}
fn sc_token(response: &Value, user: bool) -> Result<(Instant, String), String> {
    let token = response["access_token"].as_str().ok_or("SoundCloud did not return an access token.")?;
    if user && let Some(refresh) = response["refresh_token"].as_str() {
        token_store::save(SC_SESSION, refresh)?;
    }
    let seconds = response["expires_in"].as_u64().unwrap_or(3600).clamp(30, 86400);
    Ok((Instant::now() + Duration::from_secs(seconds - 20), token.to_owned()))
}
async fn json(request: RequestBuilder, name: &str) -> Result<Value, String> {
    let response = request.send().await.map_err(|_| format!("Could not reach {name}."))?;
    json_response(response, name).await
}

/// A successful answer's bytes, refused once it grows past `cap`.
async fn body(mut response: reqwest::Response, name: &str, cap: usize) -> Result<Vec<u8>, String> {
    if !response.status().is_success() {
        return Err(format!("{name} returned HTTP {}.", response.status().as_u16()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| format!("{name} stopped responding."))? {
        if bytes.len() + chunk.len() > cap {
            return Err(format!("{name} returned too much data."));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn json_response(response: reqwest::Response, name: &str) -> Result<Value, String> {
    let bytes = body(response, name, MAX_BODY).await?;
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| format!("Unreadable response from {name}."))?;
    if value.get("error").is_some_and(|e| !e.is_null()) {
        return Err(format!("{name} could not share this item."));
    }
    Ok(value)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connections {
    apple: bool,
    soundcloud: bool,
    soundcloud_user: bool,
}
#[tauri::command]
pub fn provider_connections() -> Result<Connections, String> {
    Ok(Connections {
        apple: token_store::load(APPLE_TOKEN)?.is_some(),
        soundcloud: token_store::load(SC_APP)?.is_some(),
        soundcloud_user: token_store::load(SC_SESSION)?.is_some(),
    })
}
#[tauri::command]
pub async fn provider_credentials(
    catalog: State<'_, Catalog>,
    provider: Provider,
    key: String,
    secret: String,
) -> Result<(), String> {
    match provider {
        Provider::Apple => {
            if key.is_empty() {
                token_store::clear(APPLE_TOKEN)
            } else if apple_token_valid(&key) {
                token_store::save(APPLE_TOKEN, &key)
            } else {
                Err("Enter a signed Apple Music developer token.".into())
            }
        }
        Provider::Soundcloud => {
            let mut cached = catalog.soundcloud.lock().await;
            if key.is_empty() {
                token_store::clear(SC_APP)?;
            } else {
                if [&key, &secret].iter().any(|s| {
                    s.is_empty() || s.len() > 512 || !s.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
                }) {
                    return Err("Enter the Client ID and Client Secret from your SoundCloud app.".into());
                }
                token_store::save(SC_APP, &serde_json::to_string(&(key, secret)).map_err(|e| e.to_string())?)?;
            }
            *cached = None;
            token_store::clear(SC_SESSION)
        }
        Provider::Deezer | Provider::Mixcloud | Provider::Archive => Err("This public catalog needs no credentials.".into()),
    }
}
#[tauri::command]
pub fn soundcloud_client_id() -> Result<String, String> {
    Ok(sc_app()?.0)
}
#[tauri::command]
pub async fn soundcloud_authorize(catalog: State<'_, Catalog>, code: String, verifier: String) -> Result<(), String> {
    if code.is_empty() || code.len() > 2048 || !(43..=128).contains(&verifier.len()) {
        return Err("Invalid SoundCloud authorization response.".into());
    }
    let (id, secret) = sc_app()?;
    let mut cached = catalog.soundcloud.lock().await;
    let result = json(
        catalog.http.post(SC_TOKEN).form(&[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("code_verifier", &verifier),
            ("client_id", &id),
            ("client_secret", &secret),
            ("redirect_uri", SC_CALLBACK),
        ]),
        "SoundCloud authorization",
    )
    .await?;
    *cached = Some(sc_token(&result, true)?);
    Ok(())
}
#[tauri::command]
pub async fn provider_open(app: AppHandle, provider: Provider, address: String) -> Result<(), String> {
    let url = Url::parse(&address).map_err(|_| "Invalid player link.")?;
    if !allowed(&url, provider.hosts()) {
        return Err("Use a link from the selected music provider.".into());
    }
    let label = match provider {
        Provider::Apple => "apple-player",
        Provider::Deezer => "deezer-player",
        Provider::Soundcloud => "soundcloud-player",
        Provider::Mixcloud => "mixcloud-player",
        Provider::Archive => "archive-player",
    };
    if let Some(window) = app.get_webview_window(label) {
        window.navigate(url).and_then(|()| window.show()).and_then(|()| window.set_focus()).map_err(|e| e.to_string())?;
    } else {
        WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
            .title(provider.name())
            .inner_size(1100.0, 780.0)
            .on_navigation(move |next| allowed(next, provider.hosts()))
            .build()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Request {
    Search,
    SearchAlbums,
    SearchPlaylists,
    Album,
    Playlist,
    Track,
    Artist,
    Liked,
    MyPlaylists,
    PlaylistTracks,
    AlbumTracks,
    Resolve,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Query {
    provider: Provider,
    action: Request,
    value: String,
    #[serde(default)]
    offset: usize,
    #[serde(default = "default_country")]
    country: String,
}
fn default_country() -> String {
    "us".into()
}
fn numeric(id: &str) -> bool {
    !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit())
}
fn slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value != "."
        && value != ".."
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
}
fn apple_playlist_id(id: &str) -> bool {
    id.strip_prefix("pl.").is_some_and(|rest| {
        !rest.is_empty() && rest.len() < 200 && rest.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    })
}

fn apple_playlist_page(url: &Url) -> bool {
    let Some(segments) = url.path_segments() else { return false };
    let parts = segments.collect::<Vec<_>>();
    matches!(parts.as_slice(), ["v1", "catalog", country, "playlists", id, "tracks"]
        if country.len() == 2 && country.bytes().all(|b| b.is_ascii_alphabetic()) && apple_playlist_id(id))
}
#[tauri::command]
pub async fn provider_catalog(catalog: State<'_, Catalog>, query: Query) -> Result<Value, String> {
    use Request::*;
    let Query { provider, action, value, offset, country } = query;
    let id = value.trim();
    if id.len() > 2048 || offset > 100_000 || country.len() != 2 || !country.bytes().all(|c| c.is_ascii_alphabetic()) {
        return Err("Invalid catalog request.".into());
    }
    let country = country.to_ascii_lowercase();
    let skip = offset.to_string();
    let request = match provider {
        Provider::Mixcloud => match action {
            Search if !id.is_empty() => {
                catalog.http.get("https://api.mixcloud.com/search/").query(&[("q", id), ("type", "cloudcast"), ("limit", "40")])
            }
            Track | Playlist if id.split('/').all(slug) => {
                let suffix = if matches!(action, Playlist) { "/cloudcasts/" } else { "/" };
                catalog.http.get(format!("https://api.mixcloud.com/{id}{suffix}"))
            }
            _ => return Err("Choose a public Mixcloud show or playlist.".into()),
        },
        Provider::Archive => match action {
            Search if !id.is_empty() => {
                let term = id.replace(['"', '\\'], " ");
                let q = format!("(mediatype:audio OR mediatype:etree) AND (title:\"{term}\" OR creator:\"{term}\")");
                catalog.http.get("https://archive.org/advancedsearch.php").query(&[
                    ("q", q.as_str()),
                    ("fl[]", "identifier"),
                    ("fl[]", "title"),
                    ("fl[]", "creator"),
                    ("rows", "50"),
                    ("output", "json"),
                ])
            }
            Album if slug(id) => catalog.http.get(format!("https://archive.org/metadata/{id}")),
            _ => return Err("Choose an Internet Archive audio item.".into()),
        },
        Provider::Apple => match action {
            Search | SearchAlbums if !id.is_empty() => catalog.http.get("https://itunes.apple.com/search").query(&[
                ("term", id),
                ("media", "music"),
                ("entity", if matches!(action, SearchAlbums) { "album" } else { "song" }),
                ("country", &country),
                ("limit", "50"),
            ]),
            SearchPlaylists if !id.is_empty() => catalog.http
                .get(format!("{APPLE_API}/v1/catalog/{country}/search"))
                .bearer_auth(apple_token()?)
                .query(&[("term", id), ("types", "playlists"), ("limit", "25")]),
            Track | Album | Artist if numeric(id) => catalog.http.get("https://itunes.apple.com/lookup").query(&[
                ("id", id),
                ("entity", if matches!(action, Artist) { "album" } else { "song" }),
                ("country", &country),
                ("limit", "200"),
            ]),
            Playlist if apple_playlist_id(id) => catalog.http
                .get(format!("{APPLE_API}/v1/catalog/{country}/playlists/{id}"))
                .bearer_auth(apple_token()?)
                .query(&[("include", "tracks")]),
            PlaylistTracks if apple_playlist_id(id) => catalog.http
                .get(format!("{APPLE_API}/v1/catalog/{country}/playlists/{id}/tracks"))
                .bearer_auth(apple_token()?),
            _ => return Err("Unsupported Apple Music item.".into()),
        },
        Provider::Deezer => {
            let path = match action {
                Search if !id.is_empty() => "search".to_owned(),
                SearchAlbums if !id.is_empty() => "search/album".to_owned(),
                SearchPlaylists if !id.is_empty() => "search/playlist".to_owned(),
                PlaylistTracks if numeric(id) => format!("playlist/{id}/tracks"),
                AlbumTracks if numeric(id) => format!("album/{id}/tracks"),
                Album if numeric(id) && offset > 0 => format!("album/{id}/tracks"),
                Album if numeric(id) => format!("album/{id}"),
                Playlist if numeric(id) && offset > 0 => format!("playlist/{id}/tracks"),
                Playlist if numeric(id) => format!("playlist/{id}"),
                Track if numeric(id) => format!("track/{id}"),
                Artist if numeric(id) => format!("artist/{id}/albums"),
                _ => return Err("Unsupported Deezer item.".into()),
            };
            catalog.http.get(format!("https://api.deezer.com/{path}")).query(&[("q", id), ("limit", "100"), ("index", &skip)])
        }
        Provider::Soundcloud => {
            let path = match action {
                Search if !id.is_empty() => "tracks".to_owned(),
                Resolve if Url::parse(id).is_ok_and(|u| allowed(&u, Provider::Soundcloud.hosts())) => "resolve".into(),
                PlaylistTracks if numeric(id) => format!("playlists/soundcloud:playlists:{id}/tracks"),
                Playlist | Album if numeric(id) => format!("playlists/soundcloud:playlists:{id}"),
                Track if numeric(id) => format!("tracks/soundcloud:tracks:{id}"),
                Artist if numeric(id) => format!("users/soundcloud:users:{id}/tracks"),
                Liked => "me/likes/tracks".into(),
                MyPlaylists => "me/playlists".into(),
                _ => return Err("Unsupported SoundCloud item.".into()),
            };
            let mut req = catalog
                .http
                .get(format!("https://api.soundcloud.com/{path}"))
                .header("Authorization", format!("OAuth {}", catalog.soundcloud_token().await?));
            if matches!(action, Resolve) {
                req = req.query(&[("url", id)]);
            }
            if matches!(action, Search) {
                req = req.query(&[("q", id)]);
            }
            req.query(&[("limit", "50"), ("offset", &skip), ("linked_partitioning", "true")])
        }
    };
    if matches!((provider, action), (Provider::Soundcloud, Resolve)) {
        let res = request.send().await.map_err(|_| "Could not reach SoundCloud.")?;
        if res.status().is_redirection() {
            let address = res
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|h| h.to_str().ok())
                .ok_or("SoundCloud returned an empty redirect.")?;
            return catalog_page(&catalog, provider, address).await;
        }
        return json_response(res, provider.name()).await;
    }
    json(request, provider.name()).await
}

async fn catalog_page(catalog: &Catalog, provider: Provider, address: &str) -> Result<Value, String> {
    let host = match provider {
        Provider::Mixcloud => "api.mixcloud.com",
        Provider::Archive => return Err("This archive item has no more pages.".into()),
        Provider::Apple => "api.music.apple.com",
        Provider::Deezer => "api.deezer.com",
        Provider::Soundcloud => "api.soundcloud.com",
    };
    if address.len() > 6000 {
        return Err("Invalid catalog page.".into());
    }
    let base = Url::parse(&format!("https://{host}/")).map_err(|e| e.to_string())?;
    let mut url = base.join(address).map_err(|_| "Invalid catalog page.")?;
    // Some Deezer next links still use HTTP. Only the validated API host is contacted over HTTPS.
    if matches!(provider, Provider::Deezer) && url.scheme() == "http" {
        url.set_scheme("https").map_err(|_| "Invalid Deezer page.")?;
    }
    let permitted = match provider {
        Provider::Mixcloud => url.path().trim_matches('/').split('/').all(slug),
        Provider::Archive => false,
        Provider::Apple => apple_playlist_page(&url),
        Provider::Deezer => ["/playlist/", "/album/", "/artist/", "/track/", "/search"].iter().any(|p| url.path().starts_with(p)),
        Provider::Soundcloud => {
            let path = url.path();
            matches!(path, "/tracks" | "/playlists" | "/users" | "/me/likes/tracks" | "/me/likes/playlists" | "/me/playlists")
                || ["/tracks/", "/playlists/", "/users/"].iter().any(|prefix| path.starts_with(prefix))
        }
    };
    if !allowed(&url, &[host]) || !permitted || url.fragment().is_some() {
        return Err("Unrecognized catalog page.".into());
    }
    let mut req = catalog.http.get(url);
    match provider {
        Provider::Apple => req = req.bearer_auth(apple_token()?),
        Provider::Soundcloud => req = req.header("Authorization", format!("OAuth {}", catalog.soundcloud_token().await?)),
        Provider::Deezer | Provider::Mixcloud | Provider::Archive => {}
    }
    json(req, provider.name()).await
}

#[tauri::command]
pub async fn provider_page(catalog: State<'_, Catalog>, provider: Provider, address: String) -> Result<Value, String> {
    catalog_page(&catalog, provider, &address).await
}
#[tauri::command]
pub async fn provider_expand_link(catalog: State<'_, Catalog>, address: String) -> Result<String, String> {
    const SHORT: &[&str] =
        &["spotify.link", "spotify.app.link", "on.soundcloud.com", "link.deezer.com", "deezer.page.link", "deezer.lnk.to"];
    const DEST: &[&str] = &["open.spotify.com", "soundcloud.com", "www.soundcloud.com", "www.deezer.com", "deezer.com"];
    let mut url = Url::parse(&address).map_err(|_| "Invalid share link.")?;
    if address.len() > 2048 || !allowed(&url, SHORT) {
        return Err("Choose a supported provider share link.".into());
    }
    for _ in 0..5 {
        let res = catalog.http.get(url.clone()).send().await.map_err(|_| "Could not open this share link.")?;
        let location = res
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|h| h.to_str().ok())
            .ok_or("Paste the full playlist URL from the provider's address bar.")?;
        url = url.join(location).map_err(|_| "Invalid redirect.")?;
        if allowed(&url, DEST) {
            return Ok(url.to_string());
        }
        if !res.status().is_redirection() || !allowed(&url, SHORT) {
            break;
        }
    }
    Err("Paste the full playlist URL from the provider's address bar.".into())
}

#[derive(Serialize)]
pub struct Diagnostic {
    name: &'static str,
    status: Option<u16>,
    elapsed: u64,
}
#[tauri::command]
pub async fn provider_diagnostics(catalog: State<'_, Catalog>) -> Result<Vec<Diagnostic>, String> {
    async fn check(client: &Client, name: &'static str, url: &'static str) -> Diagnostic {
        let start = Instant::now();
        let status = client.get(url).timeout(Duration::from_secs(6)).send().await.ok().map(|r| r.status().as_u16());
        Diagnostic { name, status, elapsed: start.elapsed().as_millis() as u64 }
    }
    let c = &catalog.http;
    let (carbon, apple, deezer, sc, mix, archive) = tokio::join!(
        check(c, "Carbon", "https://api.getcarbon.cc/v1/health"),
        check(c, "Apple Music", "https://itunes.apple.com/lookup?id=909253"),
        check(c, "Deezer", "https://api.deezer.com/genre/0"),
        check(c, "SoundCloud", "https://w.soundcloud.com/player/api.js"),
        check(c, "Mixcloud", "https://api.mixcloud.com/"),
        check(c, "Internet Archive", "https://archive.org/metadata/etree?output=json")
    );
    Ok(vec![carbon, apple, deezer, sc, mix, archive])
}

/// Public oEmbed supplies metadata for entries the official widget identifies by track ID.
#[tauri::command]
pub async fn provider_soundcloud_metadata(catalog: State<'_, Catalog>, value: String) -> Result<Option<Value>, String> {
    let resource = if numeric(&value) {
        format!("https://api.soundcloud.com/tracks/{value}")
    } else if value.len() <= 2048 && Url::parse(&value).is_ok_and(|u| allowed(&u, &["soundcloud.com", "www.soundcloud.com"])) {
        value
    } else {
        return Err("Invalid public SoundCloud resource.".into());
    };
    let response = catalog
        .http
        .get("https://soundcloud.com/oembed")
        .query(&[("url", resource.as_str()), ("format", "json")])
        .send()
        .await
        .map_err(|_| "Could not reach SoundCloud.")?;
    if matches!(response.status().as_u16(), 401 | 403 | 404) {
        return Ok(None);
    }
    let info = json_response(response, "SoundCloud").await?;
    Ok(Some(serde_json::json!({"title":info["title"],"author":info["author_name"],"image":info["thumbnail_url"]})))
}

/// Catalog and account resources used by the native SoundCloud pages.
#[tauri::command]
pub async fn soundcloud_get(catalog: State<'_, Catalog>, path: String, params: Vec<(String, String)>) -> Result<Value, String> {
    let parts: Vec<_> = path.split('/').collect();
    let endpoint = match parts.as_slice() {
        ["search", kind @ ("tracks" | "playlists" | "users")] => kind.to_string(),
        ["tracks"] => "tracks".into(),
        ["playlists", id] if numeric(id) => format!("playlists/soundcloud:playlists:{id}"),
        ["playlists", id, "tracks"] if numeric(id) => format!("playlists/soundcloud:playlists:{id}/tracks"),
        ["users", id] if numeric(id) => format!("users/soundcloud:users:{id}"),
        ["users", id, list @ ("tracks" | "playlists")] if numeric(id) => format!("users/soundcloud:users:{id}/{list}"),
        ["me"] | ["me", "playlists"] | ["me", "likes", "tracks" | "playlists"] | ["me", "recently-played", "tracks"] => {
            if token_store::load(SC_SESSION)?.is_none() {
                return Err("Sign in to SoundCloud to open your library.".into());
            }
            path.clone()
        }
        _ => return Err("Choose a track, playlist, or artist from SoundCloud.".into()),
    };
    if params.len() > 4
        || !params
            .iter()
            .all(|(k, v)| matches!(k.as_str(), "q" | "limit" | "urns" | "show_tracks" | "access") && v.len() <= 1600 && !v.chars().any(char::is_control))
    {
        return Err("Invalid SoundCloud search.".into());
    }
    let mut request = catalog
        .http
        .get(format!("https://api.soundcloud.com/{endpoint}"))
        .query(&params)
        .header("Authorization", format!("OAuth {}", catalog.soundcloud_token().await?));
    if !matches!(parts.as_slice(), ["me"] | ["me", "recently-played", "tracks"] | ["playlists" | "users", _]) {
        request = request.query(&[("linked_partitioning", "true")]);
    }
    json(request, "SoundCloud").await
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SoundcloudPlaylistChange {
    Create { title: String },
    Rename { id: String, title: String },
    UpdateTracks { id: String, track: String, add: bool },
}

fn soundcloud_playlist_title(title: &str) -> Result<&str, String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 200 || title.chars().any(char::is_control) {
        return Err("Enter a playlist name of up to 200 characters.".into());
    }
    Ok(title)
}

fn soundcloud_track_urn(row: &Value) -> Option<String> {
    row["urn"].as_str()
        .and_then(|urn| urn.strip_prefix("soundcloud:tracks:"))
        .filter(|id| numeric(id))
        .map(str::to_owned)
        .or_else(|| row["id"].as_u64().map(|id| id.to_string()))
        .or_else(|| row["id"].as_str().filter(|id| numeric(id)).map(str::to_owned))
        .map(|id| format!("soundcloud:tracks:{id}"))
}

fn soundcloud_playlist_tracks(playlist: &Value, track: &str, add: bool) -> Result<Option<Value>, String> {
    if !numeric(track) {
        return Err("Choose a track from SoundCloud.".into());
    }
    let incomplete = || "SoundCloud didn't share the complete playlist, so Carbon couldn't change its track list.".to_string();
    let rows = playlist["tracks"].as_array().ok_or_else(incomplete)?;
    if playlist["track_count"].as_u64() != Some(rows.len() as u64) {
        return Err(incomplete());
    }
    let mut urns: Vec<_> = rows.iter().map(soundcloud_track_urn).collect::<Option<_>>().ok_or_else(incomplete)?;
    let target = format!("soundcloud:tracks:{track}");
    let matches = urns.iter().position(|urn| urn == &target);
    match (add, matches) {
        (true, None) => urns.push(target),
        (false, Some(index)) => { urns.remove(index); }
        _ => return Ok(None),
    }
    Ok(Some(serde_json::json!({ "tracks": urns.into_iter().map(|urn| serde_json::json!({ "urn": urn })).collect::<Vec<_>>() })))
}

/// Serialize each in-app edit and use SoundCloud's latest track list for changes.
#[tauri::command]
pub async fn soundcloud_playlist_change(catalog: State<'_, Catalog>, change: SoundcloudPlaylistChange) -> Result<Value, String> {
    let _guard = catalog.soundcloud_playlist_edits.lock().await;
    if token_store::load(SC_SESSION)?.is_none() {
        return Err("Sign in to SoundCloud to edit your playlists.".into());
    }
    let auth = format!("OAuth {}", catalog.soundcloud_token().await?);
    let title_payload = |title: &str| soundcloud_playlist_title(title).map(|title| serde_json::json!({ "title": title }));
    let (id, payload) = match change {
        SoundcloudPlaylistChange::Create { title } => {
            let payload = serde_json::json!({ "playlist": { "title": soundcloud_playlist_title(&title)?, "sharing": "private", "tracks": [] } });
            return json(catalog.http.post("https://api.soundcloud.com/playlists").header("Authorization", auth).json(&payload), "SoundCloud").await;
        }
        SoundcloudPlaylistChange::Rename { id, title } => (id, title_payload(&title)?),
        SoundcloudPlaylistChange::UpdateTracks { id, track, add } => {
            if !numeric(&id) {
                return Err("Choose a playlist from SoundCloud.".into());
            }
            let url = format!("https://api.soundcloud.com/playlists/soundcloud:playlists:{id}");
            let request = catalog.http.get(url).query(&[("show_tracks", "true"), ("access", "playable,preview,blocked")]);
            let current = json(request.header("Authorization", &auth), "SoundCloud").await?;
            let Some(payload) = soundcloud_playlist_tracks(&current, &track, add)? else {
                return Ok(current);
            };
            (id, payload)
        }
    };
    if !numeric(&id) {
        return Err("Choose a playlist from SoundCloud.".into());
    }
    let request = catalog.http.put(format!("https://api.soundcloud.com/playlists/soundcloud:playlists:{id}"));
    json(request.header("Authorization", auth).json(&serde_json::json!({ "playlist": payload })), "SoundCloud").await
}
/// What Tidal's public share page says about a song, album or playlist: names and artwork only.
/// Tidal publishes no track list there, and Carbon never asks it for audio.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Shared {
    title: String,
    artist: String,
    image: Option<String>,
    duration_ms: u64,
}

fn uuid(id: &str) -> bool {
    id.len() == 36 && id.bytes().enumerate().all(|(i, b)| if matches!(i, 8 | 13 | 18 | 23) { b == b'-' } else { b.is_ascii_hexdigit() })
}

/// Remote text as one clean line of bounded length.
fn name_of(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ").chars().filter(|c| !c.is_control()).take(MAX_NAME).collect()
}

/// The entities Tidal's attributes use ("&amp;", "&#39;"); anything unrecognised stays as written.
fn unescape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        let end = rest.find(';').filter(|end| *end <= 8);
        let decoded = end.and_then(|end| match &rest[1..end] {
            "amp" => Some('&'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "lt" => Some('<'),
            "gt" => Some('>'),
            code => {
                let digits = code.strip_prefix('#')?;
                let number = digits.strip_prefix('x').map_or_else(|| digits.parse().ok(), |hex| u32::from_str_radix(hex, 16).ok());
                number.and_then(char::from_u32)
            }
        });
        match (decoded, end) {
            (Some(c), Some(end)) => {
                out.push(c);
                rest = &rest[end + 1..];
            }
            _ => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// One OpenGraph tag's content, as Tidal writes them: `<meta property="og:title" content="…">`.
fn open_graph(page: &str, property: &str) -> Option<String> {
    let start = format!("property=\"{property}\"");
    let tag = page.split("<meta ").find(|tag| tag.starts_with(&start))?;
    Some(unescape(tag.split_once("content=\"")?.1.split('"').next()?))
}

/// "PT3M28S" in milliseconds; 0 for anything else.
fn iso_duration_ms(text: &str) -> u64 {
    let (mut total, mut number) = (0u64, 0u64);
    for c in text.strip_prefix("PT").unwrap_or("?").chars() {
        let unit = match c {
            '0'..='9' => {
                number = number.saturating_mul(10).saturating_add(u64::from(c) - 48);
                continue;
            }
            'H' => 3600,
            'M' => 60,
            'S' => 1,
            _ => return 0,
        };
        total = total.saturating_add(number.saturating_mul(unit));
        number = 0;
    }
    total.min(86_400).saturating_mul(1000)
}

/// The item a share page describes: its schema.org block, else its OpenGraph title ("Artist - Title").
fn shared(page: &str) -> Option<Shared> {
    let image = |address: Option<&str>| {
        address.and_then(|a| Url::parse(a).ok()).filter(|url| allowed(url, TIDAL_IMAGES)).map(String::from)
    };
    for block in page.split("<script type=\"application/ld+json\">").skip(1) {
        let Ok(item) = serde_json::from_str::<Value>(block.split("</script>").next().unwrap_or("")) else { continue };
        if !matches!(item["@type"].as_str(), Some("MusicRecording" | "MusicAlbum" | "MusicPlaylist")) {
            continue;
        }
        let title = name_of(item["name"].as_str()?);
        let artists: Vec<&str> = item["byArtist"].as_array().into_iter().flatten().filter_map(|a| a["name"].as_str()).collect();
        return (!title.is_empty()).then(|| Shared {
            title,
            artist: name_of(&artists.join(", ")),
            image: image(item["image"].as_str()),
            duration_ms: iso_duration_ms(item["duration"].as_str().unwrap_or("")),
        });
    }
    // Tidal's "Not Found" page has a title but no music type.
    if !open_graph(page, "og:type")?.starts_with("music.") {
        return None;
    }
    let full = open_graph(page, "og:title")?;
    // shortcut: splits at the first " - ", wrong for an artist with one in their name; the schema.org block above is what normally answers.
    let (artist, title) = full.split_once(" - ").unwrap_or(("", &full));
    let title = name_of(title);
    (!title.is_empty()).then(|| Shared { title, artist: name_of(artist), image: image(open_graph(page, "og:image").as_deref()), duration_ms: 0 })
}

/// A Tidal link's public title, artist and cover, read from its share page on tidal.com.
#[tauri::command]
pub async fn tidal_shared(catalog: State<'_, Catalog>, kind: String, id: String) -> Result<Shared, String> {
    let known = match kind.as_str() {
        "track" | "album" => numeric(&id),
        "playlist" => uuid(&id),
        _ => false,
    };
    if !known {
        return Err("Choose a Tidal song, album or playlist link.".into());
    }
    let mut url = Url::parse(&format!("https://tidal.com/{kind}/{id}")).map_err(|e| e.to_string())?;
    // An album's address gains its name through a redirect; only tidal.com itself is followed.
    for _ in 0..TIDAL_REDIRECTS {
        // Tidal refuses requests that don't say who is asking.
        let request = catalog.http.get(url.clone()).header(reqwest::header::USER_AGENT, concat!("Carbon/", env!("CARGO_PKG_VERSION")));
        let response = request.send().await.map_err(|_| "Could not reach Tidal.")?;
        if response.status().is_redirection() {
            let next = response.headers().get(reqwest::header::LOCATION).and_then(|h| h.to_str().ok()).and_then(|to| url.join(to).ok());
            url = next.filter(|next| allowed(next, TIDAL_HOSTS)).ok_or("Tidal sent this link somewhere else.")?;
            continue;
        }
        if response.status().as_u16() == 404 {
            return Err("Tidal doesn't share this publicly.".into());
        }
        let page = body(response, "Tidal", MAX_PAGE).await?;
        return shared(&String::from_utf8_lossy(&page)).ok_or_else(|| "Tidal's page didn't say what this is.".into());
    }
    Err("Tidal sent this link somewhere else.".into())
}

pub async fn forget(catalog: &Catalog) -> Result<(), String> {
    token_store::clear(APPLE_TOKEN)?;
    let mut guard = catalog.soundcloud.lock().await;
    *guard = None;
    token_store::clear(SC_SESSION)?;
    token_store::clear(SC_APP)
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn soundcloud_playlist_track_edits_keep_all_existing_urns_in_order() {
        let current = serde_json::json!({
            "track_count": 3, "tracks": [{"urn": "soundcloud:tracks:4"}, {"id": 7}, {"id": "4"}]
        });
        let add = soundcloud_playlist_tracks(&current, "8", true).unwrap().unwrap();
        assert_eq!(add["tracks"], serde_json::json!([
            {"urn": "soundcloud:tracks:4"}, {"urn": "soundcloud:tracks:7"},
            {"urn": "soundcloud:tracks:4"}, {"urn": "soundcloud:tracks:8"}
        ]));
        let remove = soundcloud_playlist_tracks(&current, "4", false).unwrap().unwrap();
        assert_eq!(remove["tracks"], serde_json::json!([{"urn": "soundcloud:tracks:7"}, {"urn": "soundcloud:tracks:4"}]));
        assert_eq!(soundcloud_playlist_tracks(&current, "4", true).unwrap(), None);
    }

    #[test]
    fn soundcloud_playlist_track_edits_refuse_partial_lists() {
        let partial = serde_json::json!({"track_count": 2, "tracks": [{"id": 4}]});
        let missing_urn = serde_json::json!({"track_count": 1, "tracks": [{}]});
        assert!(soundcloud_playlist_tracks(&partial, "7", true).is_err());
        assert!(soundcloud_playlist_tracks(&missing_urn, "7", false).is_err());
    }
    #[test]
    fn provider_windows_only_navigate_to_the_selected_service() {
        for url in [
            "https://music.apple.com.evil.com",
            "http://music.apple.com",
            "https://x@music.apple.com",
            "https://music.apple.com:8080",
        ] {
            assert!(!allowed(&Url::parse(url).unwrap(), Provider::Apple.hosts()));
        }
        assert!(allowed(&Url::parse("https://music.apple.com/us/browse").unwrap(), Provider::Apple.hosts()));
        assert!(!numeric("1/other"));
    }

    #[test]
    fn apple_developer_tokens_and_playlist_continuations_have_strict_shapes() {
        assert!(apple_token_valid("header.payload.signature"));
        for token in ["header..signature", "header.payload.signature.extra", "header.payload.\n"] {
            assert!(!apple_token_valid(token));
        }
        for (path, valid) in [
            ("/v1/catalog/us/playlists/pl.u-Catalog42/tracks?offset=100", true),
            ("/v1/catalog/us/playlists/pl.u-Catalog42/tracks/unrelated", false),
            ("/v1/catalog/us/playlists/pl.bad%2Finjected/tracks", false),
            ("/v1/me/library/playlists/p.Example/tracks", false),
        ] {
            assert_eq!(apple_playlist_page(&Url::parse(&format!("{APPLE_API}{path}")).unwrap()), valid);
        }
    }

    const SONG: &str = r#"<head><title>I&#39;M THAT GIRL by Beyoncé on TIDAL</title><meta property="og:type" content="music.song"><meta property="og:title" content="Beyoncé - I&#39;M THAT GIRL"><meta property="og:image" content="https://resources.tidal.com/images/d3c4372b/640x640.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"MusicRecording","byArtist":[{"@type":"MusicGroup","name":"Daft Punk"},{"name":"Pharrell Williams"}],"duration":"PT3M28S","image":"https://resources.tidal.com/images/d3c4372b/640x640.jpg","inAlbum":{"name":"RENAISSANCE"},"name":"I'M THAT GIRL"}</script>
<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"TIDAL"}]}</script></head>"#;

    #[test]
    fn a_tidal_share_page_gives_its_public_names_and_cover() {
        let song = shared(SONG).unwrap();
        assert_eq!(song.title, "I'M THAT GIRL");
        assert_eq!(song.artist, "Daft Punk, Pharrell Williams");
        assert_eq!(song.duration_ms, 208_000);
        assert_eq!(song.image.as_deref(), Some("https://resources.tidal.com/images/d3c4372b/640x640.jpg"));
    }

    #[test]
    fn open_graph_answers_when_the_schema_block_is_missing() {
        let page = SONG.split("<script").next().unwrap();
        let song = shared(page).unwrap();
        assert_eq!((song.artist.as_str(), song.title.as_str(), song.duration_ms), ("Beyoncé", "I'M THAT GIRL", 0));
        // Artwork from any other host is dropped, and the "Not Found" page describes nothing.
        assert_eq!(shared(&page.replace("resources.tidal.com", "resources.tidal.com.evil.test")).unwrap().image, None);
        assert_eq!(shared(r#"<meta property="og:title" content="Not Found - TIDAL">"#), None);
    }

    #[test]
    fn tidal_ids_and_durations_are_read_strictly() {
        assert!(uuid("36ea71a8-445e-41a4-82ab-6628c581535d"));
        assert!(!uuid("36ea71a8-445e-41a4-82ab-6628c581535d/../x"));
        assert!(!uuid("36ea71a8x445e-41a4-82ab-6628c581535d"));
        assert_eq!(iso_duration_ms("PT1H2M3S"), 3_723_000);
        assert_eq!(iso_duration_ms("3:28"), 0);
        assert_eq!(unescape("Tom &amp; Jerry &#x27;s &bogus; &"), "Tom & Jerry 's &bogus; &");
        assert_eq!(name_of("  a\n b  ").as_str(), "a b");
    }
}
