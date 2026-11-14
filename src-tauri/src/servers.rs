//! The listener's own music servers: Navidrome and anything else that speaks Subsonic/OpenSubsonic,
//! Jellyfin (Emby answers the same calls) and Plex. Carbon signs in here, keeps the session in Windows
//! Credential Manager (never the password), and makes the library calls for the webview, whose
//! content policy can't reach an arbitrary host. Audio and artwork are loaded by the webview itself
//! from the server, with the session's query string appended.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Duration;
use tauri::State;

const SERVICE: &str = "com.pealz.carbon";
const TIMEOUT: Duration = Duration::from_secs(20);
const MAX_RESPONSE: usize = 32 * 1024 * 1024;
const MAX_URL: usize = 512;
const MAX_NAME: usize = 128;
const MAX_PASSWORD: usize = 512;
const MAX_PARAMS: usize = 24;
const MAX_PARAM: usize = 512;
const SUBSONIC_API: &str = "1.16.1";
const CLIENT: &str = "Carbon";

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Subsonic,
    Jellyfin,
    Plex,
}

const KINDS: [Kind; 3] = [Kind::Subsonic, Kind::Jellyfin, Kind::Plex];

impl Kind {
    fn account(self) -> &'static str {
        match self {
            Kind::Subsonic => "server-subsonic",
            Kind::Jellyfin => "server-jellyfin",
            Kind::Plex => "server-plex",
        }
    }

    fn name(self) -> &'static str {
        match self {
            Kind::Subsonic => "your Subsonic server",
            Kind::Jellyfin => "your Jellyfin server",
            Kind::Plex => "your Plex server",
        }
    }
}

/// What is kept in Credential Manager for one server. `secret` is a salted token (Subsonic) or an
/// access token (Jellyfin, Plex); `extra` is the salt (Subsonic) or the device id (Jellyfin, Plex).
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
struct Saved {
    url: String,
    username: String,
    user_id: String,
    secret: String,
    extra: String,
}

/// What the webview needs: where the server is and the query string that lets it load audio and
/// artwork. Library calls go through `server_get`, which adds the same session itself.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    kind: Kind,
    url: String,
    username: String,
    user_id: String,
    media_query: String,
}

pub struct Servers {
    http: reqwest::Client,
    version: String,
}

impl Servers {
    pub fn new(version: &str) -> Self {
        let agent = format!("{CLIENT}/{version}");
        Self { http: reqwest::Client::builder().timeout(TIMEOUT).user_agent(agent).build().unwrap_or_default(), version: version.to_string() }
    }
}

fn entry(kind: Kind) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, kind.account()).map_err(|e| format!("credential store unavailable: {e}"))
}

fn load(kind: Kind) -> Result<Option<Saved>, String> {
    match entry(kind)?.get_password() {
        Ok(text) => Ok(serde_json::from_str(&text).ok()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read the saved server sign-in: {e}")),
    }
}

fn save(kind: Kind, saved: &Saved) -> Result<(), String> {
    let text = serde_json::to_string(saved).map_err(|e| e.to_string())?;
    entry(kind)?.set_password(&text).map_err(|e| format!("could not save the server sign-in: {e}"))
}

fn clear(kind: Kind) -> Result<(), String> {
    match entry(kind)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not remove the saved server sign-in: {e}")),
    }
}

/// Forgets every server ("remove saved data").
pub fn clear_all() -> Result<(), String> {
    KINDS.into_iter().try_for_each(clear)
}

/// The server's address as typed, tidied: http(s) only, no sign-in, query or fragment, no trailing slash.
fn base_url(input: &str) -> Result<String, String> {
    let text = input.trim().trim_end_matches('/');
    let with_scheme = if text.contains("://") { text.to_string() } else { format!("http://{text}") };
    let bad = || "That doesn't look like a server address. Use something like http://192.168.1.10:4533".to_string();
    if with_scheme.len() > MAX_URL || with_scheme.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(bad());
    }
    let url = reqwest::Url::parse(&with_scheme).map_err(|_| bad())?;
    let plain = matches!(url.scheme(), "http" | "https") && url.host_str().is_some() && url.username().is_empty() && url.password().is_none();
    if !plain || url.query().is_some() || url.fragment().is_some() {
        return Err(bad());
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

fn check_text(text: &str, what: &str, max: usize) -> Result<(), String> {
    if text.is_empty() || text.len() > max || text.chars().any(char::is_control) {
        return Err(format!("{what} is missing or too long"));
    }
    Ok(())
}

fn random_hex<const N: usize>() -> Result<String, String> {
    let mut bytes = [0u8; N];
    getrandom::fill(&mut bytes).map_err(|e| format!("no secure random numbers: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn encode(pairs: &[(&str, &str)]) -> String {
    let mut url = reqwest::Url::parse("http://x/").expect("static url");
    url.query_pairs_mut().extend_pairs(pairs);
    url.query().unwrap_or_default().to_string()
}

fn subsonic_query(saved: &Saved) -> String {
    encode(&[("u", &saved.username), ("t", &saved.secret), ("s", &saved.extra), ("v", SUBSONIC_API), ("c", CLIENT)])
}

/// Both spellings: Jellyfin reads `ApiKey`, Emby and older Jellyfin read `api_key`.
fn jellyfin_query(saved: &Saved) -> String {
    encode(&[("ApiKey", &saved.secret), ("api_key", &saved.secret), ("DeviceId", &saved.extra), ("UserId", &saved.user_id)])
}

fn info(kind: Kind, saved: &Saved) -> ServerInfo {
    let media_query = match kind {
        Kind::Subsonic => subsonic_query(saved),
        Kind::Jellyfin => jellyfin_query(saved),
        Kind::Plex => encode(&[("X-Plex-Token", &saved.secret)]),
    };
    ServerInfo { kind, url: saved.url.clone(), username: saved.username.clone(), user_id: saved.user_id.clone(), media_query }
}

fn jellyfin_auth(version: &str, device: &str, token: Option<&str>) -> String {
    let token = token.map(|t| format!(", Token=\"{t}\"")).unwrap_or_default();
    format!("MediaBrowser Client=\"{CLIENT}\", Device=\"Windows\", DeviceId=\"{device}\", Version=\"{version}\"{token}")
}

fn explain_status(status: u16, kind: Kind) -> String {
    match status {
        401 | 403 => format!("{} refused the sign-in. Check the name and password, or connect again in Settings.", sentence(kind.name())),
        404 => format!("{} doesn't have that (or the address isn't its API).", sentence(kind.name())),
        500.. => format!("{} is having trouble right now.", sentence(kind.name())),
        _ => format!("{} answered with an error ({status}).", sentence(kind.name())),
    }
}

fn sentence(text: &str) -> String {
    let mut chars = text.chars();
    chars.next().map(|first| first.to_uppercase().chain(chars).collect()).unwrap_or_default()
}

async fn read_json(res: Result<reqwest::Response, reqwest::Error>, kind: Kind) -> Result<Value, String> {
    let res = res.map_err(|e| {
        eprintln!("[servers] request failed: {}", e.without_url());
        format!("Can't reach {}. Check the address and that it's running.", kind.name())
    })?;
    let status = res.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(explain_status(status, kind));
    }
    if res.content_length().is_some_and(|n| n as usize > MAX_RESPONSE) {
        return Err(format!("{} sent more than Carbon expected.", sentence(kind.name())));
    }
    let bytes = res.bytes().await.map_err(|e| {
        eprintln!("[servers] body failed: {}", e.without_url());
        format!("{} stopped answering. Try again.", sentence(kind.name()))
    })?;
    if bytes.len() > MAX_RESPONSE {
        return Err(format!("{} sent more than Carbon expected.", sentence(kind.name())));
    }
    if bytes.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(&bytes).map_err(|_| format!("{} sent something Carbon can't read. Is the address right?", sentence(kind.name())))
}

/// The body of a Subsonic answer, or its own error ("Wrong username or password") as a sentence.
fn subsonic_body(value: Value) -> Result<Value, String> {
    let Some(body) = value.get("subsonic-response") else {
        return Err("That server doesn't answer like a Subsonic server. Is the address right?".into());
    };
    if body.get("status").and_then(Value::as_str) == Some("ok") {
        return Ok(body.clone());
    }
    let message = body.pointer("/error/message").and_then(Value::as_str).unwrap_or("the request failed");
    Err(format!("Your server said: {}.", message.trim_end_matches('.').chars().take(200).collect::<String>()))
}

async fn subsonic_connect(servers: &Servers, url: String, username: String, password: &str) -> Result<Saved, String> {
    let salt = random_hex::<8>()?;
    let token = format!("{:x}", md5::compute(format!("{password}{salt}")));
    let saved = Saved { url, username, user_id: String::new(), secret: token, extra: salt };
    let ping = format!("{}/rest/ping.view?{}&f=json", saved.url, subsonic_query(&saved));
    subsonic_body(read_json(servers.http.get(ping).send().await, Kind::Subsonic).await?)?;
    Ok(saved)
}

async fn jellyfin_connect(servers: &Servers, url: String, username: String, password: &str) -> Result<Saved, String> {
    let device = format!("carbon-{}", random_hex::<8>()?);
    let auth = jellyfin_auth(&servers.version, &device, None);
    let req = servers
        .http
        .post(format!("{url}/Users/AuthenticateByName"))
        .header("Authorization", &auth)
        .header("X-Emby-Authorization", &auth)
        .json(&json!({ "Username": username, "Pw": password }));
    let answer = read_json(req.send().await, Kind::Jellyfin).await?;
    let text = |pointer: &str| answer.pointer(pointer).and_then(Value::as_str).filter(|s| !s.is_empty() && s.len() <= MAX_PARAM).map(str::to_string);
    let (Some(token), Some(user_id)) = (text("/AccessToken"), text("/User/Id")) else {
        return Err("That server doesn't answer like a Jellyfin server. Is the address right?".into());
    };
    Ok(Saved { url, username, user_id, secret: token, extra: device })
}

/// Plex signs requests with a token the listener copies from Plex itself (there is no password sign-in
/// for a server reached directly), so "connecting" is checking the token opens the library.
async fn plex_connect(servers: &Servers, url: String, token: &str) -> Result<Saved, String> {
    let token = token.trim();
    if token.is_empty() || token.len() > MAX_PARAM || !token.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_')) {
        return Err("That doesn't look like a Plex token. Paste the X-Plex-Token from Plex.".into());
    }
    let device = format!("carbon-{}", random_hex::<8>()?);
    let saved = Saved { url, username: "Plex".into(), user_id: String::new(), secret: token.to_string(), extra: device };
    let answer = read_json(plex_request(servers, &saved, "library/sections", "").send().await, Kind::Plex).await?;
    if answer.pointer("/MediaContainer").is_none() {
        return Err("That server doesn't answer like a Plex server. Is the address right?".into());
    }
    Ok(saved)
}

fn plex_request(servers: &Servers, saved: &Saved, path: &str, query: &str) -> reqwest::RequestBuilder {
    servers
        .http
        .get(format!("{}/{path}?{query}", saved.url))
        .header("Accept", "application/json")
        .header("X-Plex-Token", &saved.secret)
        .header("X-Plex-Client-Identifier", &saved.extra)
        .header("X-Plex-Product", CLIENT)
        .header("X-Plex-Version", &servers.version)
}

/// Signs in, checks the server answers, and remembers the session (never the password).
#[tauri::command]
pub async fn server_connect(servers: State<'_, Servers>, kind: Kind, url: String, username: String, password: String) -> Result<ServerInfo, String> {
    let url = base_url(&url)?;
    let username = username.trim().to_string();
    if kind != Kind::Plex {
        check_text(&username, "The user name", MAX_NAME)?;
    }
    if password.len() > MAX_PASSWORD || password.chars().any(char::is_control) {
        return Err("The password is too long".into());
    }
    let saved = match kind {
        Kind::Subsonic => subsonic_connect(&servers, url, username, &password).await?,
        Kind::Jellyfin => jellyfin_connect(&servers, url, username, &password).await?,
        Kind::Plex => plex_connect(&servers, url, &password).await?,
    };
    save(kind, &saved)?;
    Ok(info(kind, &saved))
}

#[tauri::command]
pub fn server_disconnect(kind: Kind) -> Result<(), String> {
    clear(kind)
}

/// The servers Carbon is signed in to.
#[tauri::command]
pub fn servers_connected() -> Result<Vec<ServerInfo>, String> {
    let mut found = Vec::new();
    for kind in KINDS {
        if let Some(saved) = load(kind)? {
            found.push(info(kind, &saved));
        }
    }
    Ok(found)
}

/// A Subsonic method ("getAlbum") or a Jellyfin or Plex path ("Users/abc/Items", "library/metadata/12/children"):
/// letters, digits and the few separators those use, so nothing typed here can leave the server's API.
fn check_path(kind: Kind, path: &str) -> Result<(), String> {
    let allowed = |c: char| c.is_ascii_alphanumeric() || (kind != Kind::Subsonic && matches!(c, '/' | '-' | '_'));
    let ok = !path.is_empty() && path.len() <= MAX_PARAM && path.chars().all(allowed) && !path.starts_with('/') && !path.contains("//");
    if ok { Ok(()) } else { Err("Carbon can't ask the server for that.".into()) }
}

fn check_params(params: &[(String, String)]) -> Result<(), String> {
    let ok = params.len() <= MAX_PARAMS && params.iter().all(|(k, v)| !k.is_empty() && k.len() <= 64 && v.len() <= MAX_PARAM && !k.chars().chain(v.chars()).any(char::is_control));
    if ok { Ok(()) } else { Err("Carbon can't ask the server for that.".into()) }
}

/// One library call, signed with the saved session. Subsonic answers come back unwrapped.
#[tauri::command]
pub async fn server_get(servers: State<'_, Servers>, kind: Kind, path: String, params: Vec<(String, String)>) -> Result<Value, String> {
    check_path(kind, &path)?;
    check_params(&params)?;
    let saved = load(kind)?.ok_or_else(|| format!("Connect {} in Settings first.", kind.name()))?;
    let extra = encode(&params.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect::<Vec<_>>());
    match kind {
        Kind::Subsonic => {
            let url = format!("{}/rest/{path}.view?{}&f=json&{extra}", saved.url, subsonic_query(&saved));
            subsonic_body(read_json(servers.http.get(url).send().await, kind).await?)
        }
        Kind::Jellyfin => {
            let auth = jellyfin_auth(&servers.version, &saved.extra, Some(&saved.secret));
            let req = servers.http.get(format!("{}/{path}?{extra}", saved.url)).header("Authorization", &auth).header("X-Emby-Authorization", &auth);
            read_json(req.send().await, kind).await
        }
        Kind::Plex => read_json(plex_request(&servers, &saved, &path, &extra).send().await, kind).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved() -> Saved {
        Saved { url: "http://nas:4533".into(), username: "me & you".into(), user_id: "u1".into(), secret: "tok".into(), extra: "salt".into() }
    }

    #[test]
    fn tidies_server_addresses_and_refuses_odd_ones() {
        assert_eq!(base_url(" 192.168.1.10:4533/ ").unwrap(), "http://192.168.1.10:4533");
        assert_eq!(base_url("https://music.example.com/navidrome/").unwrap(), "https://music.example.com/navidrome");
        for bad in ["", "ftp://nas", "http://user:pw@nas", "http://nas/?x=1", "http://nas/#a", "http://na s", "javascript:alert(1)"] {
            assert!(base_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn signs_media_links_without_the_password() {
        let subsonic = info(Kind::Subsonic, &saved());
        assert_eq!(subsonic.media_query, "u=me+%26+you&t=tok&s=salt&v=1.16.1&c=Carbon");
        let jellyfin = info(Kind::Jellyfin, &saved());
        assert_eq!(jellyfin.media_query, "ApiKey=tok&api_key=tok&DeviceId=salt&UserId=u1");
        assert!(serde_json::to_string(&jellyfin).unwrap().contains("\"mediaQuery\""));
    }

    #[test]
    fn unwraps_subsonic_answers_and_reports_their_errors() {
        let ok = json!({ "subsonic-response": { "status": "ok", "album": { "id": "1" } } });
        assert_eq!(subsonic_body(ok).unwrap()["album"]["id"], "1");
        let failed = json!({ "subsonic-response": { "status": "failed", "error": { "code": 40, "message": "Wrong username or password" } } });
        assert_eq!(subsonic_body(failed).unwrap_err(), "Your server said: Wrong username or password.");
        assert!(subsonic_body(json!({ "hello": 1 })).unwrap_err().contains("Subsonic"));
    }

    #[test]
    fn only_api_paths_and_bounded_parameters_get_through() {
        assert!(check_path(Kind::Subsonic, "getAlbumList2").is_ok());
        assert!(check_path(Kind::Subsonic, "../admin").is_err());
        assert!(check_path(Kind::Subsonic, "rest/ping").is_err());
        assert!(check_path(Kind::Jellyfin, "Users/4ed1b8b4/Items/Latest").is_ok());
        for bad in ["/Users", "Users//Items", "Users/../System", "Items?x=1", ""] {
            assert!(check_path(Kind::Jellyfin, bad).is_err(), "{bad}");
        }
        assert!(check_path(Kind::Plex, "library/metadata/123/children").is_ok());
        assert!(check_path(Kind::Plex, "library/../identity").is_err());
        assert_eq!(info(Kind::Plex, &saved()).media_query, "X-Plex-Token=tok");
        assert!(check_params(&[("id".into(), "abc".into())]).is_ok());
        assert!(check_params(&[("".into(), "abc".into())]).is_err());
        assert!(check_params(&[("id".into(), "a\nb".into())]).is_err());
        assert!(check_params(&vec![("k".into(), "v".into()); MAX_PARAMS + 1]).is_err());
    }

    #[test]
    fn builds_the_jellyfin_sign_in_header() {
        assert_eq!(jellyfin_auth("0.5.0", "dev1", None), "MediaBrowser Client=\"Carbon\", Device=\"Windows\", DeviceId=\"dev1\", Version=\"0.5.0\"");
        assert!(jellyfin_auth("0.5.0", "dev1", Some("tok")).ends_with(", Token=\"tok\""));
    }

    #[test]
    fn explains_refusals_in_plain_words() {
        assert!(explain_status(401, Kind::Jellyfin).starts_with("Your Jellyfin server refused the sign-in."));
        assert!(explain_status(502, Kind::Subsonic).contains("having trouble"));
    }
}
