//! The YouTube Music sign-in window: Google's own sign-in page in a private (in-memory) webview
//! with no access to Carbon's commands. Once it lands on music.youtube.com with a session, the
//! cookies are read here, saved to Credential Manager and the window closes.
use super::{Youtube, auth};
use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};

const LABEL: &str = "youtube-signin";
const LOGIN_URL: &str = "https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F";
const TIMEOUT: Duration = Duration::from_secs(600);
const BLOCKED: &str = "Google didn't allow signing in from Carbon's window (it said the browser may not be secure). \
YouTube Music still plays without signing in; your library, likes and playlists need it.";

enum Event {
    Landed,
    Blocked,
    Closed,
}

/// Google's "This browser or app may not be secure" page.
pub fn is_rejected(url: &Url) -> bool {
    url.host_str() == Some("accounts.google.com") && url.path().contains("rejected")
}

fn is_music(url: &Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some("music.youtube.com")
}

fn build(app: &AppHandle, tx: UnboundedSender<Event>) -> Result<WebviewWindow, String> {
    let (nav, load, closed) = (tx.clone(), tx.clone(), tx);
    let url = LOGIN_URL.parse().map_err(|_| "bad sign-in address")?;
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url))
        .title("Sign in to YouTube Music")
        .inner_size(480.0, 720.0)
        .center()
        .incognito(true)
        .on_navigation(move |url| {
            if is_rejected(url) {
                let _ = nav.send(Event::Blocked);
            }
            true
        })
        .on_page_load(move |_, page| {
            if page.event() == PageLoadEvent::Finished && is_music(page.url()) {
                let _ = load.send(Event::Landed);
            }
        });
    // Webviews sharing Carbon's WebView2 profile must be created with the same browser arguments.
    let main = app.config().app.windows.iter().find(|w| w.label == "main");
    if let Some(args) = main.and_then(|w| w.additional_browser_args.as_deref()) {
        builder = builder.additional_browser_args(args);
    }
    let window = builder.build().map_err(|e| format!("Couldn't open the sign-in window: {e}"))?;
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let _ = closed.send(Event::Closed);
        }
    });
    Ok(window)
}

/// The window's YouTube cookies, if they hold a signed-in session.
async fn session(window: &WebviewWindow) -> Result<Option<String>, String> {
    let window = window.clone();
    let origin = Url::parse(auth::ORIGIN).map_err(|e| e.to_string())?;
    // WebView2 deadlocks if cookies are read on the thread that delivers its events.
    let cookies = tauri::async_runtime::spawn_blocking(move || window.cookies_for_url(origin))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Couldn't read the sign-in: {e}"))?;
    let header = auth::cookie_header(cookies.iter().map(|c| (c.name(), c.value())))?;
    Ok(auth::is_signed_in(&header).then_some(header))
}

async fn wait(window: &WebviewWindow, rx: &mut UnboundedReceiver<Event>) -> Result<String, String> {
    let deadline = tokio::time::Instant::now() + TIMEOUT;
    loop {
        match tokio::time::timeout_at(deadline, rx.recv()).await {
            Err(_) => return Err("Sign-in timed out. Try again.".into()),
            Ok(None | Some(Event::Closed)) => return Err("Sign-in was cancelled.".into()),
            Ok(Some(Event::Blocked)) => return Err(BLOCKED.into()),
            // Landing without a session (an account chooser's "Skip") keeps the window open.
            Ok(Some(Event::Landed)) => {
                if let Some(header) = session(window).await? {
                    return Ok(header);
                }
            }
        }
    }
}

#[tauri::command]
pub async fn ytm_sign_in(app: AppHandle, yt: State<'_, Youtube>) -> Result<(), String> {
    if let Some(open) = app.get_webview_window(LABEL) {
        let _ = open.set_focus();
        return Err("The YouTube Music sign-in window is already open.".into());
    }
    let (tx, mut rx) = unbounded_channel();
    let window = build(&app, tx)?;
    let result = wait(&window, &mut rx).await;
    let _ = window.close();
    let header = result?;
    auth::save(&header)?;
    yt.set_cookies(Some(header));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spots_googles_rejection_page() {
        let url = |s: &str| Url::parse(s).unwrap();
        assert!(is_rejected(&url("https://accounts.google.com/v3/signin/rejected?flowName=x")));
        assert!(is_rejected(&url("https://accounts.google.com/signin/v2/deniedsigninrejected")));
        assert!(!is_rejected(&url("https://accounts.google.com/v3/signin/identifier")));
        assert!(!is_rejected(&url("https://evil.example/rejected")));
        assert!(is_music(&url("https://music.youtube.com/")));
        assert!(!is_music(&url("http://music.youtube.com/")));
        assert!(!is_music(&url("https://music.youtube.com.evil.example/")));
    }
}
