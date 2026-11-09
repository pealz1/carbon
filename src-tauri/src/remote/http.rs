//! The HTTP side of the remote: accepts connections and screens every request before the app
//! (static files and the socket.io upgrade) sees it.
use super::guard::check_request;
use axum::Router;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio::task::JoinSet;
use tower::ServiceExt;

const ACCEPT_RETRY: Duration = Duration::from_millis(100);

/// Serves until `stop` fires (or its sender is dropped), then closes every open connection.
pub async fn serve(listener: TcpListener, app: Router, port: u16, mut stop: oneshot::Receiver<()>) {
    let mut connections = JoinSet::new();
    loop {
        tokio::select! {
            _ = &mut stop => break,
            Some(_) = connections.join_next() => {}
            accepted = listener.accept() => match accepted {
                Ok((stream, peer)) => {
                    connections.spawn(connection(stream, peer, app.clone(), port));
                }
                Err(e) => {
                    eprintln!("[remote] couldn't accept a connection: {e}");
                    tokio::time::sleep(ACCEPT_RETRY).await;
                }
            },
        }
    }
    connections.shutdown().await;
}

async fn connection(stream: TcpStream, peer: SocketAddr, app: Router, port: u16) {
    let service = service_fn(move |request| screen(request, peer, app.clone(), port));
    let served = http1::Builder::new().serve_connection(TokioIo::new(stream), service).with_upgrades();
    // Errors here are clients hanging up or sending garbage: routine, and nothing to report.
    let _ = served.await;
}

/// Turns other websites away before the app sees the request, and tells the app who's asking.
async fn screen(mut request: Request<Incoming>, peer: SocketAddr, app: Router, port: u16) -> Result<Response, Infallible> {
    if check_request(request.headers(), port).is_err() {
        return Ok(StatusCode::FORBIDDEN.into_response());
    }
    request.extensions_mut().insert(ConnectInfo(peer));
    app.oneshot(request).await
}
