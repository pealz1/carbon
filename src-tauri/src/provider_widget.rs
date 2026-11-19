//! The provider SDK runs on a separate loopback origin, outside Tauri's registered app protocols.
use axum::{
    Router,
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
    routing::get,
};
use tokio::sync::OnceCell;

static PORT: OnceCell<u16> = OnceCell::const_new();
const CSP: &str = "default-src 'none'; script-src 'self' https://w.soundcloud.com/player/api.js; frame-src https://w.soundcloud.com/player/; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
fn asset(mime: &'static str, body: &'static str) -> Response {
    let mut response = body.into_response();
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    response.headers_mut().insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static(CSP));
    response.headers_mut().insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    response
}
#[tauri::command]
pub async fn provider_widget_url() -> Result<String, String> {
    let port = PORT
        .get_or_try_init(|| async {
            let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await.map_err(|e| e.to_string())?;
            let port = listener.local_addr().map_err(|e| e.to_string())?.port();
            let router = Router::new()
                .route(
                    "/soundcloud.html",
                    get(|| async { asset("text/html; charset=utf-8", include_str!("../native/widget/soundcloud.html")) }),
                )
                .route(
                    "/soundcloud.js",
                    get(|| async { asset("text/javascript; charset=utf-8", include_str!("../native/widget/soundcloud.js")) }),
                );
            tauri::async_runtime::spawn(async move {
                if let Err(e) = axum::serve(listener, router).await {
                    eprintln!("[provider widget] {e}");
                }
            });
            Ok::<u16, String>(port)
        })
        .await?;
    Ok(format!("http://127.0.0.1:{port}/soundcloud.html"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn serves_only_bundled_widget_files_on_an_independent_loopback_origin() {
        let address = provider_widget_url().await.unwrap();
        assert!(address.starts_with("http://127.0.0.1:"));
        let url = reqwest::Url::parse(&address).unwrap();
        let client = reqwest::Client::new();
        let response = client.get(url.clone()).send().await.unwrap();
        assert_eq!(response.headers()[header::CONTENT_SECURITY_POLICY], CSP);
        assert!(response.text().await.unwrap().contains("w.soundcloud.com/player/api.js"));
        assert_eq!(client.get(url.join("unknown").unwrap()).send().await.unwrap().status(), 404);
    }
}
