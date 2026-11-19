//! This origin serves two bundled files and has no desktop permissions.
use tauri::http::{Request, Response};

pub fn response(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let (status, mime, content) = match request.uri().path() {
        "/soundcloud.html" => (200, "text/html; charset=utf-8", include_str!("../../static/players/soundcloud.html")),
        "/soundcloud.js" => (200, "text/javascript; charset=utf-8", include_str!("../../static/players/soundcloud.js")),
        _ => (404, "text/plain", "Page not found"),
    };
    Response::builder().status(status).header("Content-Type",mime)
        .header("Content-Security-Policy","default-src 'none'; script-src 'self' https://w.soundcloud.com/player/api.js; frame-src https://w.soundcloud.com/player/; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
        .header("X-Content-Type-Options","nosniff").body(content.as_bytes().to_vec()).unwrap()
}
