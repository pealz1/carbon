//! The HTTP side of the remote: accepts LAN connections, a few at a time per peer, and screens
//! every request before the app (static files and the socket.io upgrade) sees it.
use super::guard::{check_request, is_lan};
use axum::Router;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::{TokioIo, TokioTimer};
use std::collections::HashMap;
use std::convert::Infallible;
use std::io;
use std::net::{IpAddr, SocketAddr};
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio::task::JoinSet;
use tower::ServiceExt;

const ACCEPT_RETRY: Duration = Duration::from_millis(100);
/// A phone loading the app opens about 6 at once plus its websocket; scripts on the same PC share
/// the loopback address.
pub const MAX_CONNECTIONS_PER_PEER: usize = 16;
/// To send request headers; also how long an idle keep-alive connection stays open.
pub const HEADER_TIMEOUT: Duration = Duration::from_secs(5);

/// A connection that holds its peer's slot for as long as it is open, websocket upgrade included.
struct Counted {
    stream: TcpStream,
    _slot: Arc<()>,
}

impl AsyncRead for Counted {
    fn poll_read(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().stream).poll_read(cx, buf)
    }
}

impl AsyncWrite for Counted {
    fn poll_write(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<io::Result<usize>> {
        Pin::new(&mut self.get_mut().stream).poll_write(cx, buf)
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().stream).poll_flush(cx)
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().stream).poll_shutdown(cx)
    }
}

/// A slot for one more connection from `ip`, unless it's off the LAN or already at the cap.
/// A peer's open connections are the live clones of its `Arc`.
fn slot(open: &mut HashMap<IpAddr, Arc<()>>, ip: IpAddr) -> Option<Arc<()>> {
    open.retain(|_, slot| Arc::strong_count(slot) > 1);
    if !is_lan(ip) {
        return None;
    }
    let slot = open.entry(ip).or_default();
    (Arc::strong_count(slot) <= MAX_CONNECTIONS_PER_PEER).then(|| slot.clone())
}

/// Serves until `stop` fires (or its sender is dropped), then closes every open connection.
pub async fn serve(listener: TcpListener, app: Router, port: u16, mut stop: oneshot::Receiver<()>) {
    let mut connections = JoinSet::new();
    let mut open = HashMap::new();
    loop {
        tokio::select! {
            _ = &mut stop => break,
            Some(_) = connections.join_next() => {}
            accepted = listener.accept() => match accepted {
                // Dropping the stream hangs up on peers that get no slot.
                Ok((stream, peer)) => if let Some(slot) = slot(&mut open, peer.ip()) {
                    connections.spawn(connection(Counted { stream, _slot: slot }, peer, app.clone(), port));
                },
                Err(e) => {
                    eprintln!("[remote] couldn't accept a connection: {e}");
                    tokio::time::sleep(ACCEPT_RETRY).await;
                }
            },
        }
    }
    connections.shutdown().await;
}

async fn connection(stream: Counted, peer: SocketAddr, app: Router, port: u16) {
    let service = service_fn(move |request| screen(request, peer, app.clone(), port));
    let served = http1::Builder::new()
        .timer(TokioTimer::new())
        .header_read_timeout(HEADER_TIMEOUT)
        .serve_connection(TokioIo::new(stream), service)
        .with_upgrades();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caps_connections_per_lan_peer() {
        let mut open = HashMap::new();
        let phone = IpAddr::from([192, 168, 1, 9]);
        assert!(slot(&mut open, IpAddr::from([8, 8, 8, 8])).is_none(), "off the LAN");
        let held: Vec<_> = (0..MAX_CONNECTIONS_PER_PEER).map(|_| slot(&mut open, phone).unwrap()).collect();
        assert!(slot(&mut open, phone).is_none());
        assert!(slot(&mut open, IpAddr::from([192, 168, 1, 10])).is_some(), "other peers unaffected");
        drop(held);
        assert!(slot(&mut open, phone).is_some());
        assert_eq!(open.len(), 1, "forgets peers with nothing open");
    }
}
