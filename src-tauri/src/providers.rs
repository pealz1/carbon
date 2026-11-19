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
const MAX_BODY: usize = 8 * 1024 * 1024;

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

async fn json_response(mut response: reqwest::Response, name: &str) -> Result<Value, String> {
    if !response.status().is_success() {
        return Err(format!("{name} returned HTTP {}.", response.status().as_u16()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| format!("{name} stopped responding."))? {
        if bytes.len() + chunk.len() > MAX_BODY {
            return Err(format!("{name} returned too much data."));
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| format!("Unreadable response from {name}."))?;
    if value.get("error").is_some_and(|e| !e.is_null()) {
        return Err(format!("{name} could not share this item."));
    }
    Ok(value)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connections {
    soundcloud: bool,
    soundcloud_user: bool,
}
#[tauri::command]
pub fn provider_connections() -> Result<Connections, String> {
    Ok(Connections {
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
        Provider::Apple => Err("Apple Music uses its official web player.".into()),
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
    Album,
    Playlist,
    Track,
    Artist,
    Liked,
    MyPlaylists,
    PlaylistTracks,
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
            Search if !id.is_empty() => catalog.http.get("https://itunes.apple.com/search").query(&[
                ("term", id),
                ("entity", "song"),
                ("country", &country),
                ("limit", "50"),
            ]),
            Track | Album | Artist if numeric(id) => catalog.http.get("https://itunes.apple.com/lookup").query(&[
                ("id", id),
                ("entity", if matches!(action, Artist) { "album" } else { "song" }),
                ("country", &country),
                ("limit", "200"),
            ]),
            Playlist => return Err(
                "Open this playlist in Apple Music and export it as XML or text. Choose the file in Carbon to import its tracks."
                    .into(),
            ),
            _ => return Err("Unsupported Apple Music item.".into()),
        },
        Provider::Deezer => {
            let path = match action {
                Search if !id.is_empty() => "search".to_owned(),
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
        Provider::Apple => return Err("This Apple Music item has no more public pages.".into()),
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
        Provider::Apple => false,
        Provider::Deezer => ["/playlist/", "/album/", "/artist/", "/track/", "/search"].iter().any(|p| url.path().starts_with(p)),
        Provider::Soundcloud => {
            ["/tracks", "/playlists/", "/users/", "/me/likes/tracks", "/me/playlists"].iter().any(|p| url.path().starts_with(p))
        }
    };
    if !allowed(&url, &[host]) || !permitted || url.fragment().is_some() {
        return Err("Unrecognized catalog page.".into());
    }
    let mut req = catalog.http.get(url);
    match provider {
        Provider::Apple => unreachable!(),
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

/// Compatibility with saved Carbon artist and playlist links, using SoundCloud's documented resources.
#[tauri::command]
pub async fn soundcloud_get(catalog: State<'_, Catalog>, path: String, params: Vec<(String, String)>) -> Result<Value, String> {
    let parts: Vec<_> = path.split('/').collect();
    let endpoint = match parts.as_slice() {
        ["search", kind @ ("tracks" | "playlists" | "users")] => kind.to_string(),
        ["tracks"] => "tracks".into(),
        ["playlists", id] if numeric(id) => format!("playlists/soundcloud:playlists:{id}"),
        ["users", id] if numeric(id) => format!("users/soundcloud:users:{id}"),
        ["users", id, list @ ("tracks" | "playlists")] if numeric(id) => format!("users/soundcloud:users:{id}/{list}"),
        _ => return Err("Choose a track, playlist, or artist from SoundCloud.".into()),
    };
    if params.len() > 4
        || !params
            .iter()
            .all(|(k, v)| matches!(k.as_str(), "q" | "limit" | "ids") && v.len() <= 1024 && !v.chars().any(char::is_control))
    {
        return Err("Invalid SoundCloud search.".into());
    }
    let request = catalog
        .http
        .get(format!("https://api.soundcloud.com/{endpoint}"))
        .query(&params)
        .query(&[("linked_partitioning", "true")])
        .header("Authorization", format!("OAuth {}", catalog.soundcloud_token().await?));
    json(request, "SoundCloud").await
}
pub async fn forget(catalog: &Catalog) -> Result<(), String> {
    let mut guard = catalog.soundcloud.lock().await;
    *guard = None;
    token_store::clear(SC_SESSION)?;
    token_store::clear(SC_APP)
}
#[cfg(test)]
mod tests {
    use super::*;
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
}
