//! End-to-end tests over a real socket on 127.0.0.1, speaking raw engine.io v4 frames.
use super::*;
use crate::playback::sample;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;
const WAIT: Duration = Duration::from_secs(5);

struct Harness {
    server: Server,
    state: watch::Sender<Option<RemoteState>>,
    commands: Arc<Mutex<Vec<MediaCommand>>>,
}

async fn harness() -> Harness {
    // Loopback only: binding every interface from a test would pop a firewall prompt.
    let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
    let (state, rx) = watch::channel(None);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let sink = commands.clone();
    let ctx = Context {
        state: rx,
        on_command: Arc::new(move |c| sink.lock().unwrap().push(c)),
        on_change: Arc::new(|| {}),
        app_version: "9.9.9".into(),
    };
    Harness { server: start(listener, ctx).await.unwrap(), state, commands }
}

async fn next_text(ws: &mut Ws) -> String {
    loop {
        let frame = tokio::time::timeout(WAIT, ws.next()).await.expect("timed out").expect("closed").unwrap();
        match frame {
            // engine.io heartbeat: answer and keep reading
            Message::Text(text) if text.as_str() == "2" => ws.send(Message::text("3")).await.unwrap(),
            Message::Text(text) => return text.to_string(),
            _ => {}
        }
    }
}

/// The websocket upgrade, sent with `origin` like a browser would; the HTTP status if refused.
async fn upgrade(port: u16, origin: Option<&str>) -> Result<Ws, u16> {
    let mut request = format!("ws://127.0.0.1:{port}/socket.io/?EIO=4&transport=websocket").into_client_request().unwrap();
    if let Some(origin) = origin {
        request.headers_mut().insert("origin", origin.parse().unwrap());
    }
    match connect_async(request).await {
        Ok((ws, _)) => Ok(ws),
        Err(tokio_tungstenite::tungstenite::Error::Http(response)) => Err(response.status().as_u16()),
        Err(e) => panic!("upgrade failed: {e}"),
    }
}

/// Opens an engine.io session and sends the socket.io CONNECT with `auth`; returns the reply.
async fn pair(port: u16, auth: &str) -> (Ws, String) {
    pair_from(port, None, auth).await
}

async fn pair_from(port: u16, origin: Option<&str>, auth: &str) -> (Ws, String) {
    let mut ws = upgrade(port, origin).await.expect("upgrade refused");
    assert!(next_text(&mut ws).await.starts_with('0'), "engine.io open packet");
    ws.send(Message::text(format!("40{auth}"))).await.unwrap();
    let reply = next_text(&mut ws).await;
    (ws, reply)
}

async fn paired(h: &Harness) -> Ws {
    let (mut ws, reply) = pair(h.server.port, &format!(r#"{{"token":"{}","name":"Test deck"}}"#, h.server.secrets().code)).await;
    assert!(reply.starts_with("40"), "connected: {reply}");
    assert!(next_text(&mut ws).await.starts_with(r#"42["hello""#));
    assert!(next_text(&mut ws).await.starts_with(r#"42["state""#));
    ws
}

#[tokio::test]
async fn serves_the_remote_app_with_security_headers() {
    let h = harness().await;
    let base = format!("http://127.0.0.1:{}", h.server.port);
    let page = reqwest::get(format!("{base}/")).await.unwrap();
    assert_eq!(page.status(), 200);
    assert!(page.headers()["content-type"].to_str().unwrap().starts_with("text/html"));
    assert!(page.headers()["content-security-policy"].to_str().unwrap().contains("script-src 'self'"));
    assert_eq!(reqwest::get(format!("{base}/nope")).await.unwrap().status(), 404);
    h.server.stop().await;
}

#[tokio::test]
async fn takes_its_own_page_and_turns_away_other_websites_and_rebound_names() {
    let h = harness().await;
    let port = h.server.port;
    let auth = format!(r#"{{"token":"{}"}}"#, h.server.secrets().token);
    let (_, reply) = pair_from(port, Some(&format!("http://127.0.0.1:{port}")), &auth).await;
    assert!(reply.starts_with("40"), "own page: {reply}");
    assert_eq!(upgrade(port, Some("http://evil.example")).await.err(), Some(403));
    assert_eq!(upgrade(port, Some("null")).await.err(), Some(403));

    let client = reqwest::Client::new();
    let get = |host: String| client.get(format!("http://127.0.0.1:{port}/")).header("host", host).send();
    assert_eq!(get(format!("evil.example:{port}")).await.unwrap().status(), 403);
    assert_eq!(get(format!("127.0.0.1:{}", port.wrapping_add(1))).await.unwrap().status(), 403);
    assert_eq!(get(format!("127.0.0.1:{port}")).await.unwrap().status(), 200);
    h.server.stop().await;
}

#[tokio::test]
async fn rejects_missing_and_wrong_secrets() {
    let h = harness().await;
    let (_, reply) = pair(h.server.port, r#"{"token":"123456"}"#).await;
    assert!(reply.starts_with("44") && reply.contains("unauthorized"), "{reply}");
    let (_, reply) = pair(h.server.port, "").await;
    assert!(reply.starts_with("44"), "{reply}");
    assert!(h.server.devices().is_empty());
    h.server.stop().await;
}

#[tokio::test]
async fn greets_lists_the_device_and_forwards_only_valid_commands() {
    let h = harness().await;
    let (mut ws, reply) = pair(h.server.port, &format!(r#"{{"token":"{}"}}"#, h.server.secrets().token)).await;
    assert!(reply.starts_with("40"), "{reply}");
    assert_eq!(next_text(&mut ws).await, r#"42["hello",{"appVersion":"9.9.9","protocolVersion":1}]"#);
    assert_eq!(next_text(&mut ws).await, r#"42["state",null]"#);
    let devices = h.server.devices();
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].address, "127.0.0.1");

    for frame in [r#"42["seek",{"positionMs":-5}]"#, r#"42["playUri",{"uri":"bad"}]"#, r#"42["quit"]"#, r#"42["seek",{"positionMs":1500}]"#, r#"42["play"]"#] {
        ws.send(Message::text(frame)).await.unwrap();
    }
    tokio::time::sleep(Duration::from_millis(300)).await;
    let mut got = h.commands.lock().unwrap().clone();
    got.sort_by_key(|c| format!("{c:?}"));
    assert_eq!(got, vec![MediaCommand::Play, MediaCommand::Seek { position_ms: 1500 }]);
    h.server.stop().await;
}

#[tokio::test]
async fn pushes_changes_now_and_position_ticks_at_most_once_a_second() {
    let h = harness().await;
    let mut ws = paired(&h).await;
    h.state.send_replace(Some(RemoteState::from(&sample("t1", 200_000, 1_000, false))));
    let first = next_text(&mut ws).await;
    assert!(first.contains(r#""trackId":"t1""#) && first.contains(r#""positionMs":1000"#), "{first}");

    let sent = Instant::now();
    h.state.send_replace(Some(RemoteState::from(&sample("t1", 200_000, 1_400, false))));
    let tick = next_text(&mut ws).await;
    assert!(tick.contains(r#""positionMs":1400"#), "{tick}");
    assert!(sent.elapsed() >= Duration::from_millis(500), "position update wasn't throttled");

    h.state.send_replace(Some(RemoteState::from(&sample("t2", 200_000, 0, false))));
    let sent = Instant::now();
    assert!(next_text(&mut ws).await.contains(r#""trackId":"t2""#));
    assert!(sent.elapsed() < Duration::from_millis(500), "track change was delayed");
    h.server.stop().await;
}

#[tokio::test]
async fn rotating_signs_remotes_out_and_retires_the_old_code() {
    let h = harness().await;
    let old = h.server.secrets();
    let mut ws = paired(&h).await;
    h.server.rotate().unwrap();
    assert!(next_text(&mut ws).await.starts_with("41"), "server-side disconnect");
    let (_, reply) = pair(h.server.port, &format!(r#"{{"token":"{}"}}"#, old.code)).await;
    assert!(reply.starts_with("44"), "{reply}");
    assert_ne!(h.server.secrets(), old);
    h.server.stop().await;
}

#[tokio::test]
async fn disconnects_one_device_and_frees_the_port_on_stop() {
    let h = harness().await;
    let mut ws = paired(&h).await;
    let id = h.server.devices()[0].id.clone();
    assert!(h.server.disconnect(&id));
    assert!(next_text(&mut ws).await.starts_with("41"));
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(h.server.devices().is_empty());
    assert!(!h.server.disconnect("not-a-socket"));

    let port = h.server.port;
    h.server.stop().await;
    assert!(std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).is_ok());
}

#[test]
fn names_devices_safely() {
    assert_eq!(device_name(Some("  Deck\u{7}  "), Some("Mozilla")), "Deck");
    assert_eq!(device_name(Some(""), Some("Mozilla/5.0")), "Mozilla/5.0");
    assert_eq!(device_name(None, None), "Remote");
    assert_eq!(device_name(Some(&"x".repeat(100)), None).len(), MAX_NAME);
}
