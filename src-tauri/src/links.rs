//! Links from outside Carbon (`carbon://` links, the command line) as something to play or a page
//! to open. The Spotify and YouTube Music shapes mirror `parseLink` in src/lib/links.ts; anything
//! else is refused here, so the webview only ever sees a URI or a route Carbon knows.
use crate::tray;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Url};

/// Sent to the webview (src/lib/deep-links.ts) with a `Target`.
const EVENT: &str = "deep-link";
pub const SCHEME: &str = "carbon";
const MAX_LEN: usize = 2048;
const SPOTIFY_ID_LEN: usize = 22;
const YOUTUBE_VIDEO_LEN: usize = 11;
const YOUTUBE_ID_LEN: std::ops::RangeInclusive<usize> = 2..=128;
const YOUTUBE_HOSTS: [&str; 4] = ["music.youtube.com", "www.youtube.com", "youtube.com", "m.youtube.com"];
/// Carbon's own pages without an id (src/routes).
const PAGES: [&str; 20] = [
    "/",
    "/bookmarks",
    "/collections",
    "/history",
    "/library",
    "/liked",
    "/local",
    "/now-playing",
    "/podcasts",
    "/radio",
    "/recap",
    "/releases",
    "/search",
    "/settings",
    "/smart",
    "/sound",
    "/stats",
    "/youtube",
    "/youtube/library",
    "/youtube/search",
];

#[derive(Serialize, Clone, PartialEq, Eq, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Target {
    /// A `spotify:` or `ytm:` URI the player takes.
    Play { uri: String },
    /// One of Carbon's own routes.
    Open { path: String },
}

fn play(uri: String) -> Option<Target> {
    Some(Target::Play { uri })
}

fn open(path: String) -> Option<Target> {
    Some(Target::Open { path })
}

/// Songs and episodes always play. Albums, playlists and artists play when `play`, otherwise
/// their page opens; a podcast only has a page.
fn spotify(kind: &str, id: &str, play_lists: bool) -> Option<Target> {
    if id.len() != SPOTIFY_ID_LEN || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    match kind {
        "track" | "episode" => play(format!("spotify:{kind}:{id}")),
        "album" | "playlist" | "artist" if play_lists => play(format!("spotify:{kind}:{id}")),
        "album" | "playlist" | "artist" | "show" => open(format!("/{kind}/{id}")),
        _ => None,
    }
}

fn youtube(kind: &str, id: &str, play_lists: bool) -> Option<Target> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return None;
    }
    match kind {
        "video" if id.len() == YOUTUBE_VIDEO_LEN => play(format!("ytm:video:{id}")),
        "album" | "playlist" | "artist" if !YOUTUBE_ID_LEN.contains(&id.len()) => None,
        "album" | "playlist" | "artist" if play_lists => play(format!("ytm:{kind}:{id}")),
        "album" | "playlist" | "artist" => open(format!("/youtube/{kind}/{id}")),
        _ => None,
    }
}

fn query(url: &Url, key: &str) -> Option<String> {
    url.query_pairs().find(|(k, _)| k == key).map(|(_, value)| value.into_owned())
}

/// An open.spotify.com, YouTube Music or YouTube address.
fn web(url: &Url, play_lists: bool) -> Option<Target> {
    let host = url.host_str()?;
    let parts: Vec<&str> = url.path_segments()?.filter(|part| !part.is_empty()).collect();
    if host == "open.spotify.com" {
        // Shared links carry a locale first: open.spotify.com/intl-de/track/…
        let parts: Vec<&str> = parts.into_iter().filter(|part| !part.starts_with("intl-")).collect();
        return spotify(parts.first()?, parts.get(1)?, play_lists);
    }
    if host == "youtu.be" {
        return youtube("video", parts.first()?, play_lists);
    }
    if !YOUTUBE_HOSTS.contains(&host) {
        return None;
    }
    match *parts.first()? {
        "watch" => youtube("video", &query(url, "v")?, play_lists),
        "playlist" => youtube("playlist", &query(url, "list")?, play_lists),
        "channel" => youtube("artist", parts.get(1)?, play_lists),
        "browse" => {
            let id = parts.get(1)?;
            let kind = if id.starts_with("MPRE") { "album" } else { id.strip_prefix("UC").map(|_| "artist")? };
            youtube(kind, id, play_lists)
        }
        _ => None,
    }
}

/// What a `spotify:` URI, a `ytm:` URI or a Spotify / YouTube Music link points at. `play_lists`
/// says whether an album, playlist or artist plays (true) or opens its page, as pasting does.
pub fn resolve(text: &str, play_lists: bool) -> Option<Target> {
    let text = text.trim();
    if text.len() > MAX_LEN {
        return None;
    }
    let parts: Vec<&str> = text.split(':').collect();
    match parts.as_slice() {
        ["spotify", kind, id] => spotify(kind, id, play_lists),
        ["ytm", kind, id] => youtube(kind, id, play_lists),
        _ => {
            let url = Url::parse(text).ok()?;
            if matches!(url.scheme(), "http" | "https") { web(&url, play_lists) } else { None }
        }
    }
}

/// One of Carbon's own routes: a page from `PAGES`, or an album, artist, playlist or podcast page.
fn page(path: &str) -> Option<Target> {
    let path = if path.len() > 1 { path.trim_end_matches('/') } else { "/" };
    if PAGES.contains(&path) {
        return open(path.to_owned());
    }
    let parts: Vec<&str> = path.split('/').collect();
    match parts.as_slice() {
        ["", kind @ ("album" | "artist" | "playlist" | "show"), id] => spotify(kind, id, false),
        ["", "youtube", kind @ ("album" | "artist" | "playlist"), id] => youtube(kind, id, false),
        _ => None,
    }
}

/// `carbon://play/<uri>`, `carbon://open/<path>` or `carbon://link?u=<encoded link>`.
pub fn from_url(text: &str) -> Option<Target> {
    if text.len() > MAX_LEN {
        return None;
    }
    let url = Url::parse(text).ok()?;
    if url.scheme() != SCHEME {
        return None;
    }
    match url.host_str()? {
        "play" => {
            // Some browsers escape the colons of the URI inside the link.
            let uri = url.path().strip_prefix('/')?.replace("%3A", ":").replace("%3a", ":");
            if uri.starts_with("spotify:") || uri.starts_with("ytm:") { resolve(&uri, true) } else { None }
        }
        "open" if url.query().is_none() => page(url.path()),
        "link" => resolve(&query(&url, "u")?, false),
        _ => None,
    }
}

/// Hands a checked target to the webview. A page comes to the front; music just starts.
pub fn deliver(app: &AppHandle, target: &Target) {
    if matches!(target, Target::Open { .. }) {
        tray::show_main(app);
    }
    if let Err(e) = app.emit(EVENT, target) {
        eprintln!("[links] could not hand the link to the window: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "6rqhFgbbKwnb9MLmUQDhG6";

    fn plays(uri: &str) -> Option<Target> {
        play(uri.to_owned())
    }

    fn opens(path: &str) -> Option<Target> {
        open(path.to_owned())
    }

    #[test]
    fn resolves_spotify_uris_and_links() {
        assert_eq!(resolve(&format!("spotify:track:{ID}"), false), plays(&format!("spotify:track:{ID}")));
        assert_eq!(resolve(&format!("spotify:episode:{ID}"), false), plays(&format!("spotify:episode:{ID}")));
        assert_eq!(resolve(&format!("spotify:album:{ID}"), false), opens(&format!("/album/{ID}")));
        assert_eq!(resolve(&format!("spotify:album:{ID}"), true), plays(&format!("spotify:album:{ID}")));
        assert_eq!(resolve(&format!("spotify:show:{ID}"), true), opens(&format!("/show/{ID}")));
        assert_eq!(resolve(&format!(" https://open.spotify.com/intl-de/track/{ID}?si=abc "), false), plays(&format!("spotify:track:{ID}")));
        assert_eq!(resolve(&format!("https://open.spotify.com/playlist/{ID}"), false), opens(&format!("/playlist/{ID}")));
        assert_eq!(resolve(&format!("https://open.spotify.com/playlist/{ID}"), true), plays(&format!("spotify:playlist:{ID}")));
    }

    #[test]
    fn resolves_youtube_music_uris_and_links() {
        assert_eq!(resolve("ytm:video:dQw4w9WgXcQ", false), plays("ytm:video:dQw4w9WgXcQ"));
        assert_eq!(resolve("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM", false), plays("ytm:video:dQw4w9WgXcQ"));
        assert_eq!(resolve("https://youtu.be/dQw4w9WgXcQ", false), plays("ytm:video:dQw4w9WgXcQ"));
        assert_eq!(resolve("https://music.youtube.com/playlist?list=PL_abc-123", false), opens("/youtube/playlist/PL_abc-123"));
        assert_eq!(resolve("https://music.youtube.com/playlist?list=PL_abc-123", true), plays("ytm:playlist:PL_abc-123"));
        assert_eq!(resolve("https://music.youtube.com/browse/MPREb_abc", false), opens("/youtube/album/MPREb_abc"));
        assert_eq!(resolve("https://music.youtube.com/channel/UCabc", false), opens("/youtube/artist/UCabc"));
        assert_eq!(resolve("ytm:artist:UCabc", true), plays("ytm:artist:UCabc"));
    }

    #[test]
    fn refuses_everything_else() {
        for bad in [
            "",
            "spotify:user:someone",
            "spotify:track:short",
            "spotify:track:6rqhFgbbKwnb9MLmUQDh-6",
            "spotify:track:6rqhFgbbKwnb9MLmUQDhG6:extra",
            "ytm:video:too-short",
            "ytm:video:dQw4w9WgXc<",
            "ytm:playlist:x",
            "local:track:1",
            "javascript:alert(1)",
            "file:///C:/Windows/win.ini",
            "https://evil.example/track/6rqhFgbbKwnb9MLmUQDhG6",
            "ftp://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6",
            "https://music.youtube.com/browse/VLPLabc",
            "https://open.spotify.com/",
        ] {
            assert_eq!(resolve(bad, true), None, "{bad}");
        }
        let long = format!("https://open.spotify.com/track/{ID}?x={}", "a".repeat(MAX_LEN));
        assert_eq!(resolve(&long, true), None);
    }

    #[test]
    fn reads_carbon_links() {
        assert_eq!(from_url(&format!("carbon://play/spotify:track:{ID}")), plays(&format!("spotify:track:{ID}")));
        assert_eq!(from_url(&format!("carbon://play/spotify%3Aalbum%3A{ID}")), plays(&format!("spotify:album:{ID}")));
        assert_eq!(from_url("carbon://play/ytm:video:dQw4w9WgXcQ"), plays("ytm:video:dQw4w9WgXcQ"));
        assert_eq!(from_url("carbon://open/liked"), opens("/liked"));
        assert_eq!(from_url("carbon://open/youtube/library/"), opens("/youtube/library"));
        assert_eq!(from_url("carbon://open/"), opens("/"));
        assert_eq!(from_url("carbon://open"), opens("/"));
        assert_eq!(from_url(&format!("carbon://open/album/{ID}")), opens(&format!("/album/{ID}")));
        assert_eq!(from_url("carbon://open/youtube/playlist/PL_abc-123"), opens("/youtube/playlist/PL_abc-123"));
        let link = format!("carbon://link?u=https%3A%2F%2Fopen.spotify.com%2Falbum%2F{ID}%3Fsi%3Dx");
        assert_eq!(from_url(&link), opens(&format!("/album/{ID}")));
        assert_eq!(from_url("carbon://link?u=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ"), plays("ytm:video:dQw4w9WgXcQ"));
    }

    #[test]
    fn refuses_carbon_links_it_does_not_know() {
        for bad in [
            "carbon://quit",
            "carbon://play/",
            &format!("carbon://play/https://open.spotify.com/track/{ID}"),
            "carbon://play/local:track:1",
            &format!("carbon://PLAY/spotify:track:{ID}"),
            "carbon://open/popout/mini",
            "carbon://open/server/plex",
            "carbon://open/settings?reset=1",
            "carbon://open/album/not-an-id",
            &format!("carbon://open/track/{ID}"),
            "carbon://open//evil.example",
            "carbon://link",
            "carbon://link?u=https%3A%2F%2Fevil.example%2F",
            "carbon://link?u=javascript%3Aalert(1)",
            &format!("https://play/spotify:track:{ID}"),
            &format!("carbonx://play/spotify:track:{ID}"),
            "not a url",
        ] {
            assert_eq!(from_url(bad), None, "{bad}");
        }
        assert_eq!(from_url(&format!("carbon://open/{}", "a".repeat(MAX_LEN))), None);
    }

    #[test]
    fn serialises_targets_for_the_webview() {
        let json = |target: Option<Target>| serde_json::to_string(&target.unwrap()).unwrap();
        assert_eq!(json(plays("ytm:video:dQw4w9WgXcQ")), r#"{"kind":"play","uri":"ytm:video:dQw4w9WgXcQ"}"#);
        assert_eq!(json(opens("/liked")), r#"{"kind":"open","path":"/liked"}"#);
    }
}
