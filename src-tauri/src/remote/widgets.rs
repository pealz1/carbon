//! Streamer widgets (Settings → Remote, off by default): what's playing as JSON for tools like
//! OBS's Tuna plugin, and an overlay page for an OBS browser source.
//!
//! There is no pairing, so this is its own listener, bound to 127.0.0.1: only programs on this PC
//! can connect at all, it works with the phone remote off, and Windows never asks about the
//! network. Websites are still kept out, because a browser on this PC is such a program: the
//! shared screening (`http::serve`) refuses a foreign `Origin` and any `Host` that is a name, and
//! `allowed` refuses cross-site loads that send no `Origin`. It only answers GET, changes nothing,
//! and sends no CORS headers.
use super::http;
use super::protocol::RemoteState;
use axum::Router;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

// shortcut: a fixed port with no setting; add one if 10768 turns out to clash for someone.
pub const PORT: u16 = 10768;
const STOP_TIMEOUT: Duration = Duration::from_secs(2);
const JSON_PATH: &str = "/widgets/now-playing.json";
const JSON: &str = "application/json; charset=utf-8";
const HTML: &str = "text/html; charset=utf-8";
const JS: &str = "text/javascript; charset=utf-8";
const CSS: &str = "text/css; charset=utf-8";
/// What a browser sends with a request a page made to its own server, or one typed by hand.
const OWN_FETCH_SITES: [&str; 2] = ["same-origin", "none"];

const ASSETS: [(&str, &str, &[u8]); 3] = [
    ("/widgets/overlay", HTML, include_bytes!("../../remote/widgets/overlay.html")),
    ("/widgets/overlay.js", JS, include_bytes!("../../remote/widgets/overlay.js")),
    ("/widgets/overlay.css", CSS, include_bytes!("../../remote/widgets/overlay.css")),
];

// The overlay loads its own script and style, the JSON beside it, and artwork over https.
const CSP: &str = "default-src 'none'; script-src 'self'; style-src 'self'; img-src https:; \
    connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/// The last playback report and when it arrived, to work out the position since.
pub type Playing = Arc<Mutex<Option<(RemoteState, Instant)>>>;

/// The JSON, with the field names Tuna and tools like it use. Times are milliseconds.
#[derive(Serialize, PartialEq, Debug, Default)]
struct NowPlaying {
    status: &'static str,
    title: String,
    artists: Vec<String>,
    album: String,
    cover_url: String,
    duration: u64,
    progress: u64,
}

fn now_playing(playing: Option<&(RemoteState, Instant)>, now: Instant) -> NowPlaying {
    let Some((state, at)) = playing else { return NowPlaying { status: "stopped", ..NowPlaying::default() } };
    let elapsed = if state.paused { 0 } else { now.saturating_duration_since(*at).as_millis() as u64 };
    NowPlaying {
        status: if state.paused { "paused" } else { "playing" },
        title: state.title.clone(),
        artists: state.artists.clone(),
        album: state.album.clone(),
        cover_url: state.artwork_url.clone().unwrap_or_default(),
        duration: state.duration_ms,
        progress: state.position_ms.saturating_add(elapsed).min(state.duration_ms),
    }
}

/// Programs on this PC only, and no page of another website: an `<img>` or `<script>` there
/// sends no `Origin` to screen, but browsers do say the load is cross-site.
fn allowed(peer: Option<IpAddr>, headers: &HeaderMap) -> bool {
    let local = peer.is_some_and(|ip| ip.to_canonical().is_loopback());
    let site = headers.get("sec-fetch-site").map(|value| value.to_str().unwrap_or_default());
    local && site.is_none_or(|site| OWN_FETCH_SITES.contains(&site))
}

fn respond(mime: &'static str, body: Vec<u8>) -> Response {
    let headers = [
        (header::CONTENT_TYPE, mime),
        (header::CONTENT_SECURITY_POLICY, CSP),
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        (header::REFERRER_POLICY, "no-referrer"),
        (header::X_FRAME_OPTIONS, "DENY"),
        (header::CACHE_CONTROL, "no-store"),
        // Belt and braces: browsers drop the answer to another site's no-cors load.
        (header::HeaderName::from_static("cross-origin-resource-policy"), "same-origin"),
    ];
    (headers, body).into_response()
}

async fn serve(State(playing): State<Playing>, request: Request) -> Response {
    let peer = request.extensions().get::<ConnectInfo<SocketAddr>>().map(|info| info.0.ip());
    if !allowed(peer, request.headers()) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if request.method() != Method::GET {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let path = request.uri().path();
    if path == JSON_PATH {
        let current = playing.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        return match serde_json::to_vec(&now_playing(current.as_ref(), Instant::now())) {
            Ok(body) => respond(JSON, body),
            Err(e) => {
                eprintln!("[widgets] could not write the now-playing JSON: {e}");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        };
    }
    match ASSETS.iter().find(|(asset, ..)| *asset == path) {
        Some((_, mime, body)) => respond(mime, body.to_vec()),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

fn router(playing: Playing) -> Router {
    Router::new().fallback(serve).with_state(playing)
}

pub struct Widgets {
    shutdown: oneshot::Sender<()>,
    serve: JoinHandle<()>,
}

/// Serves on an already-bound listener (binding stays synchronous so callers see port errors).
/// Must run inside the Tokio runtime.
pub async fn start(listener: std::net::TcpListener, playing: Playing) -> Result<Widgets, String> {
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let listener = tokio::net::TcpListener::from_std(listener).map_err(|e| e.to_string())?;
    let (shutdown, signal) = oneshot::channel::<()>();
    let serve = tokio::spawn(http::serve(listener, router(playing), port, signal));
    Ok(Widgets { shutdown, serve })
}

impl Widgets {
    /// Frees the port before returning.
    pub async fn stop(self) {
        let _ = self.shutdown.send(());
        let mut serve = self.serve;
        if tokio::time::timeout(STOP_TIMEOUT, &mut serve).await.is_err() {
            serve.abort();
            let _ = serve.await;
        }
    }
}

#[cfg(test)]
mod tests {
    //! Over a real socket on 127.0.0.1, like server_tests.rs.
    use super::*;
    use crate::playback::sample;
    use std::net::Ipv4Addr;
    use tower::ServiceExt;

    struct Harness {
        widgets: Widgets,
        port: u16,
        playing: Playing,
    }

    impl Harness {
        fn url(&self, path: &str) -> String {
            format!("http://127.0.0.1:{}{path}", self.port)
        }

        fn play(&self, position_ms: u64, paused: bool) {
            let state = RemoteState::from(&sample("t1", 229_000, position_ms, paused));
            *self.playing.lock().unwrap() = Some((state, Instant::now()));
        }
    }

    async fn harness() -> Harness {
        let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let playing = Playing::default();
        Harness { widgets: start(listener, playing.clone()).await.unwrap(), port, playing }
    }

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        pairs.iter().map(|(name, value)| (header::HeaderName::from_static(name), value.parse().unwrap())).collect()
    }

    #[test]
    fn works_out_the_position_since_the_last_report() {
        let at = Instant::now();
        let later = at + Duration::from_secs(5);
        let playing = (RemoteState::from(&sample("t1", 229_000, 10_000, false)), at);
        let now = now_playing(Some(&playing), later);
        assert_eq!((now.status, now.progress, now.duration), ("playing", 15_000, 229_000));
        assert_eq!((now.title.as_str(), now.artists.join(","), now.album.as_str()), ("No Surprises", "Radiohead".to_string(), "OK Computer"));
        assert_eq!(now.cover_url, "https://i.scdn.co/image/abc");

        let near_the_end = (RemoteState::from(&sample("t1", 229_000, 228_000, false)), at);
        assert_eq!(now_playing(Some(&near_the_end), later).progress, 229_000, "never past the end");
        let paused = (RemoteState::from(&sample("t1", 229_000, 10_000, true)), at);
        assert_eq!((now_playing(Some(&paused), later).status, now_playing(Some(&paused), later).progress), ("paused", 10_000));
        assert_eq!(now_playing(None, later), NowPlaying { status: "stopped", ..NowPlaying::default() });
    }

    #[test]
    fn only_lets_this_pc_in_and_no_other_website() {
        let none = HeaderMap::new();
        assert!(allowed(Some(IpAddr::from([127, 0, 0, 1])), &none));
        assert!(allowed(Some("::1".parse().unwrap()), &none));
        assert!(allowed(Some("::ffff:127.0.0.1".parse().unwrap()), &none));
        assert!(!allowed(Some(IpAddr::from([192, 168, 1, 9])), &none), "a phone on the LAN");
        assert!(!allowed(Some(IpAddr::from([8, 8, 8, 8])), &none));
        assert!(!allowed(None, &none));

        let local = Some(IpAddr::from([127, 0, 0, 1]));
        assert!(allowed(local, &headers(&[("sec-fetch-site", "same-origin")])), "the overlay's own polling");
        assert!(allowed(local, &headers(&[("sec-fetch-site", "none")])), "typed into a browser");
        assert!(!allowed(local, &headers(&[("sec-fetch-site", "cross-site")])));
        assert!(!allowed(local, &headers(&[("sec-fetch-site", "same-site")])));
    }

    #[tokio::test]
    async fn a_peer_that_is_not_this_pc_gets_nothing() {
        let playing = Playing::default();
        let ask = |peer: [u8; 4], path: &'static str| {
            let mut request = axum::http::Request::builder().uri(path).body(axum::body::Body::empty()).unwrap();
            request.extensions_mut().insert(ConnectInfo(SocketAddr::from((peer, 50_000))));
            router(playing.clone()).oneshot(request)
        };
        for path in [JSON_PATH, "/widgets/overlay", "/widgets/overlay.js"] {
            let refused = ask([192, 168, 1, 9], path).await.unwrap();
            assert_eq!(refused.status(), StatusCode::FORBIDDEN, "{path}");
            let body = axum::body::to_bytes(refused.into_body(), 1024).await.unwrap();
            assert!(body.is_empty(), "{path}");
            assert_eq!(ask([127, 0, 0, 1], path).await.unwrap().status(), StatusCode::OK, "{path}");
        }
    }

    #[tokio::test]
    async fn serves_what_is_playing_without_pairing_or_cors() {
        let h = harness().await;
        let stopped: serde_json::Value = reqwest::get(h.url(JSON_PATH)).await.unwrap().json().await.unwrap();
        assert_eq!(stopped["status"], "stopped");

        h.play(10_000, true);
        let reply = reqwest::get(h.url(JSON_PATH)).await.unwrap();
        assert_eq!(reply.status(), 200);
        assert!(reply.headers()["content-type"].to_str().unwrap().starts_with("application/json"));
        assert!(reply.headers().keys().all(|name| !name.as_str().starts_with("access-control-")), "no CORS headers");
        assert_eq!(reply.headers()["cross-origin-resource-policy"], "same-origin");
        assert_eq!(reply.headers()["x-content-type-options"], "nosniff");
        let now: serde_json::Value = reply.json().await.unwrap();
        let expected = serde_json::json!({
            "status": "paused",
            "title": "No Surprises",
            "artists": ["Radiohead"],
            "album": "OK Computer",
            "cover_url": "https://i.scdn.co/image/abc",
            "duration": 229_000,
            "progress": 10_000,
        });
        assert_eq!(now, expected);
        h.widgets.stop().await;
    }

    #[tokio::test]
    async fn serves_the_overlay_and_nothing_else() {
        let h = harness().await;
        let page = reqwest::get(h.url("/widgets/overlay")).await.unwrap();
        assert_eq!(page.status(), 200);
        assert!(page.headers()["content-type"].to_str().unwrap().starts_with("text/html"));
        assert!(page.headers()["content-security-policy"].to_str().unwrap().contains("script-src 'self'"));
        let html = page.text().await.unwrap();
        assert!(!html.contains("http://") && !html.contains("https://"), "the page asks nobody else for anything");
        for (path, status) in [("/widgets/overlay.js", 200), ("/widgets/overlay.css", 200), ("/", 404), ("/app.js", 404), ("/widgets/../Cargo.toml", 404)] {
            assert_eq!(reqwest::get(h.url(path)).await.unwrap().status(), status, "{path}");
        }
        assert!(ASSETS.iter().all(|(_, _, body)| !body.is_empty()));
        h.widgets.stop().await;
    }

    #[tokio::test]
    async fn turns_away_other_websites_and_rebound_names() {
        let h = harness().await;
        h.play(10_000, false);
        let client = reqwest::Client::new();
        let own = format!("http://127.0.0.1:{}", h.port);
        let get = |name: &'static str, value: &str| client.get(h.url(JSON_PATH)).header(name, value).send();
        for (name, value) in [
            ("origin", "http://evil.example"),
            ("origin", "null"),
            ("origin", "http://localhost"),
            ("sec-fetch-site", "cross-site"),
            ("host", "evil.example"),
            ("host", "localhost"),
        ] {
            let refused = get(name, value).await.unwrap();
            assert_eq!(refused.status(), 403, "{name}: {value}");
            assert!(refused.headers().keys().all(|header| !header.as_str().starts_with("access-control-")));
            assert!(refused.text().await.unwrap().is_empty(), "{name}: {value}");
        }
        assert_eq!(get("origin", &own).await.unwrap().status(), 200, "the overlay itself");
        h.widgets.stop().await;
    }

    #[tokio::test]
    async fn only_answers_get_and_frees_the_port_on_stop() {
        let h = harness().await;
        let client = reqwest::Client::new();
        assert_eq!(client.post(h.url(JSON_PATH)).body("{}").send().await.unwrap().status(), 405);
        assert_eq!(client.delete(h.url(JSON_PATH)).send().await.unwrap().status(), 405);
        assert!(h.playing.lock().unwrap().is_none(), "nothing a request sends changes anything");
        let port = h.port;
        h.widgets.stop().await;
        assert!(std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_ok());
    }
}
