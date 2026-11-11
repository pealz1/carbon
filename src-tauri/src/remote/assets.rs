//! The phone remote web app, embedded in the binary (sources in src-tauri/remote/).
use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};

const HTML: &str = "text/html; charset=utf-8";
const JS: &str = "text/javascript; charset=utf-8";
const CSS: &str = "text/css; charset=utf-8";
const PNG: &str = "image/png";
const MANIFEST: &str = "application/manifest+json";

const ASSETS: [(&str, &str, &[u8]); 9] = [
    ("/", HTML, include_bytes!("../../remote/index.html")),
    ("/index.html", HTML, include_bytes!("../../remote/index.html")),
    ("/app.js", JS, include_bytes!("../../remote/app.js")),
    ("/logic.js", JS, include_bytes!("../../remote/logic.js")),
    ("/app.css", CSS, include_bytes!("../../remote/app.css")),
    ("/socket.io.esm.min.js", JS, include_bytes!("../../remote/vendor/socket.io.esm.min.js")),
    ("/manifest.webmanifest", MANIFEST, include_bytes!("../../remote/manifest.webmanifest")),
    ("/icon-256.png", PNG, include_bytes!("../../icons/128x128@2x.png")),
    ("/icon-512.png", PNG, include_bytes!("../../icons/icon.png")),
];

// Artwork comes from Spotify's or YouTube's image CDNs; everything else is same-origin. No inline
// script or style.
const CSP: &str = "default-src 'none'; script-src 'self'; style-src 'self'; \
    img-src 'self' https://i.scdn.co https://i.ytimg.com https://lh3.googleusercontent.com https://yt3.ggpht.com https://yt3.googleusercontent.com; \
    connect-src 'self' ws:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

pub fn find(path: &str) -> Option<(&'static str, &'static [u8])> {
    ASSETS.iter().find(|(p, ..)| *p == path).map(|(_, mime, body)| (*mime, *body))
}

pub async fn serve(uri: Uri) -> Response {
    let Some((mime, body)) = find(uri.path()) else { return StatusCode::NOT_FOUND.into_response() };
    let headers = [
        (header::CONTENT_TYPE, mime),
        (header::CONTENT_SECURITY_POLICY, CSP),
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        (header::REFERRER_POLICY, "no-referrer"),
        (header::X_FRAME_OPTIONS, "DENY"),
        (header::CACHE_CONTROL, "no-cache"),
    ];
    (headers, body).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_the_app_and_nothing_else() {
        assert_eq!(find("/").map(|(mime, _)| mime), Some(HTML));
        assert_eq!(find("/socket.io.esm.min.js").map(|(mime, _)| mime), Some(JS));
        assert!(find("/../Cargo.toml").is_none());
        assert!(find("/logic.test.js").is_none());
        assert!(ASSETS.iter().all(|(_, _, body)| !body.is_empty()));
    }
}
