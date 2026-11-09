//! Loopback receiver for Spotify's OAuth redirect (PKCE flow; the webview does the rest).
use std::io::{ErrorKind, Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

// Must match the redirect URI registered in the Spotify dashboard and src/lib/config.ts.
const OAUTH_REDIRECT_ADDR: &str = "127.0.0.1:8888";
const OAUTH_TIMEOUT: Duration = Duration::from_secs(300);
const OAUTH_POLL: Duration = Duration::from_millis(100);
const DONE_PAGE: &str = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
<!doctype html><title>Carbon</title><body style=\"background:#0e0f12;color:#e8e8ec;font:16px 'Segoe UI Variable',system-ui;display:grid;place-items:center;height:90vh\">\
<p>You're signed in to Carbon. You can close this tab.</p></body>";
const NOT_FOUND: &[u8] = b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";

/// Query string of a `GET /callback?...` request, or None for anything else (e.g. /favicon.ico).
pub fn callback_query(request: &str) -> Option<&str> {
    let target = request.lines().next()?.split_whitespace().nth(1)?;
    target.strip_prefix("/callback?")
}

fn accept_redirect() -> Result<String, String> {
    let listener = TcpListener::bind(OAUTH_REDIRECT_ADDR)
        .map_err(|e| format!("could not listen on {OAUTH_REDIRECT_ADDR}: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + OAUTH_TIMEOUT;
    while Instant::now() < deadline {
        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(OAUTH_POLL);
                continue;
            }
            Err(e) => return Err(format!("accept failed: {e}")),
        };
        stream.set_nonblocking(false).map_err(|e| e.to_string())?;
        let mut buf = [0u8; 8192];
        let n = stream.read(&mut buf).map_err(|e| format!("read failed: {e}"))?;
        let request = String::from_utf8_lossy(&buf[..n]);
        if let Some(query) = callback_query(&request) {
            let _ = stream.write_all(DONE_PAGE.as_bytes()); // cosmetic; the query is what matters
            return Ok(query.to_string());
        }
        let _ = stream.write_all(NOT_FOUND);
    }
    Err("Timed out waiting for Spotify sign-in".into())
}

/// Listens once on the loopback redirect URI and returns the callback's raw query string.
#[tauri::command]
pub async fn wait_for_oauth_redirect() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(accept_redirect)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::callback_query;

    #[test]
    fn extracts_callback_query() {
        let req = "GET /callback?code=abc&state=xyz HTTP/1.1\r\nHost: 127.0.0.1:8888\r\n\r\n";
        assert_eq!(callback_query(req), Some("code=abc&state=xyz"));
    }

    #[test]
    fn ignores_other_paths_and_garbage() {
        assert_eq!(callback_query("GET /favicon.ico HTTP/1.1\r\n\r\n"), None);
        assert_eq!(callback_query("GET /callbackx?code=1 HTTP/1.1\r\n\r\n"), None);
        assert_eq!(callback_query(""), None);
    }
}
