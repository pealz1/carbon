//! The socket.io server (websocket transport only) and the embedded remote web app.
//! Knows nothing about Tauri: state comes in on a watch channel, commands go out to a sink.
use super::guard::{Guard, Reject, Secrets, check_request};
use super::{assets, http};
use super::protocol::{self, COMMAND_EVENTS, Hello, RemoteState};
use crate::media_controls::MediaCommand;
use axum::Router;
use axum::extract::ConnectInfo;
use serde::{Deserialize, Serialize};
use socketioxide::extract::{SocketRef, TryData};
use socketioxide::handler::ConnectHandler;
use socketioxide::socket::Sid;
use socketioxide::{SocketIo, TransportType};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{oneshot, watch};
use tokio::task::JoinHandle;

const MAX_MESSAGE_BYTES: usize = 4 * 1024;
const MAX_NAME: usize = 40;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const STOP_TIMEOUT: Duration = Duration::from_secs(2);

pub type CommandSink = Arc<dyn Fn(MediaCommand) + Send + Sync>;
pub type ChangeHook = Arc<dyn Fn() + Send + Sync>;

pub struct Context {
    pub state: watch::Receiver<Option<RemoteState>>,
    pub on_command: CommandSink,
    /// Called when devices connect or disconnect.
    pub on_change: ChangeHook,
    pub app_version: String,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub address: String,
    pub connected_at_ms: u64,
}

/// The handshake `auth` object.
#[derive(Deserialize, Default)]
struct Auth {
    token: Option<String>,
    name: Option<String>,
}

struct Shared {
    ctx: Context,
    /// The bound port, which a request's Host must name.
    port: u16,
    secrets: Mutex<Secrets>,
    guard: Mutex<Guard>,
    devices: Mutex<Vec<Device>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn peer_ip(s: &SocketRef) -> Option<IpAddr> {
    s.req_parts().extensions.get::<ConnectInfo<SocketAddr>>().map(|c| c.0.ip())
}

/// Printable, trimmed, short. Falls back to the browser's user agent, then a generic label.
fn device_name(auth: Option<&str>, user_agent: Option<&str>) -> String {
    let clean = |s: &str| s.chars().filter(|c| !c.is_control()).take(MAX_NAME).collect::<String>().trim().to_owned();
    [auth, user_agent].into_iter().flatten().map(clean).find(|n| !n.is_empty()).unwrap_or_else(|| "Remote".into())
}

impl Shared {
    fn admit(&self, s: &SocketRef, auth: Option<&Auth>) -> Result<(), Reject> {
        check_request(&s.req_parts().headers, self.port)?;
        let devices = lock(&self.devices).len();
        let secrets = lock(&self.secrets).clone();
        let offered = auth.and_then(|a| a.token.as_deref());
        lock(&self.guard).admit(peer_ip(s), offered, &secrets, devices, Instant::now())
    }

    fn connected(self: &Arc<Self>, s: SocketRef, auth: Option<Auth>) {
        let user_agent = s.req_parts().headers.get("user-agent").and_then(|v| v.to_str().ok());
        let device = Device {
            id: s.id.to_string(),
            name: device_name(auth.as_ref().and_then(|a| a.name.as_deref()), user_agent),
            address: peer_ip(&s).map(|ip| ip.to_string()).unwrap_or_default(),
            connected_at_ms: SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64),
        };
        lock(&self.devices).push(device);
        let hello = Hello { app_version: self.ctx.app_version.clone(), protocol_version: protocol::PROTOCOL_VERSION };
        let current = self.ctx.state.borrow().clone();
        if s.emit("hello", &hello).and_then(|_| s.emit("state", &current)).is_err() {
            eprintln!("[remote] could not greet {}", s.id);
        }
        for event in COMMAND_EVENTS {
            let sink = self.ctx.on_command.clone();
            s.on(event, async move |TryData(data): TryData<serde_json::Value>| {
                if let Some(command) = protocol::parse_command(event, data.ok().as_ref()) {
                    sink(command);
                }
            });
        }
        let shared = self.clone();
        s.on_disconnect(async move |s: SocketRef| {
            lock(&shared.devices).retain(|d| d.id != s.id.to_string());
            (shared.ctx.on_change)();
        });
        (self.ctx.on_change)();
    }
}

fn register(io: &SocketIo, shared: Arc<Shared>) {
    let gate = shared.clone();
    let middleware = move |s: SocketRef, TryData(auth): TryData<Auth>| {
        let result = gate.admit(&s, auth.as_ref().ok());
        async move { result }
    };
    let handler = move |s: SocketRef, TryData(auth): TryData<Auth>| {
        shared.connected(s, auth.ok());
        async {}
    };
    io.ns("/", handler.with(middleware));
}

/// Sends `state` to every remote, throttling position-only changes (see protocol::send_delay).
async fn broadcast(io: SocketIo, mut rx: watch::Receiver<Option<RemoteState>>) {
    let mut last: Option<Option<RemoteState>> = None;
    let mut sent_at = Instant::now();
    loop {
        let next = rx.borrow_and_update().clone();
        if let Some(wait) = protocol::send_delay(last.as_ref(), &next, sent_at.elapsed()) {
            if !wait.is_zero() {
                tokio::select! {
                    _ = tokio::time::sleep(wait) => {}
                    changed = rx.changed() => if changed.is_err() { return },
                }
                continue;
            }
            if let Err(e) = io.emit("state", &next).await {
                eprintln!("[remote] state broadcast failed: {e}");
            }
            last = Some(next);
            sent_at = Instant::now();
        }
        if rx.changed().await.is_err() {
            return;
        }
    }
}

pub struct Server {
    pub port: u16,
    shared: Arc<Shared>,
    io: SocketIo,
    shutdown: oneshot::Sender<()>,
    serve: JoinHandle<()>,
    broadcast: JoinHandle<()>,
}

/// Serves on an already-bound listener (binding stays synchronous so callers see port errors).
/// Must run inside the Tokio runtime.
pub async fn start(listener: std::net::TcpListener, ctx: Context) -> Result<Server, String> {
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let listener = tokio::net::TcpListener::from_std(listener).map_err(|e| e.to_string())?;
    let state = ctx.state.clone();
    let shared = Arc::new(Shared {
        ctx,
        port,
        secrets: Mutex::new(Secrets::generate()?),
        guard: Mutex::default(),
        devices: Mutex::default(),
    });
    let (layer, io) = SocketIo::builder()
        .transports([TransportType::Websocket])
        .max_payload(MAX_MESSAGE_BYTES as u64)
        .ws_max_message_size(MAX_MESSAGE_BYTES)
        .ws_max_frame_size(MAX_MESSAGE_BYTES)
        .max_buffer_size(64)
        .connect_timeout(CONNECT_TIMEOUT)
        .build_layer();
    register(&io, shared.clone());
    let app = Router::new().fallback(assets::serve).layer(layer);
    let (shutdown, signal) = oneshot::channel::<()>();
    let serve = tokio::spawn(http::serve(listener, app, port, signal));
    let broadcast = tokio::spawn(broadcast(io.clone(), state));
    Ok(Server { port, shared, io, shutdown, serve, broadcast })
}

impl Server {
    /// Disconnects every remote and frees the port before returning.
    pub async fn stop(self) {
        self.broadcast.abort();
        self.io.close().await;
        let _ = self.shutdown.send(());
        let mut serve = self.serve;
        if tokio::time::timeout(STOP_TIMEOUT, &mut serve).await.is_err() {
            serve.abort();
            let _ = serve.await;
        }
    }

    pub fn secrets(&self) -> Secrets {
        lock(&self.shared.secrets).clone()
    }

    pub fn devices(&self) -> Vec<Device> {
        lock(&self.shared.devices).clone()
    }

    /// New secrets, and every paired remote has to pair again.
    pub fn rotate(&self) -> Result<(), String> {
        *lock(&self.shared.secrets) = Secrets::generate()?;
        *lock(&self.shared.guard) = Guard::default(); // nobody is in good standing with the new secrets
        for socket in self.io.sockets() {
            let _ = socket.disconnect();
        }
        Ok(())
    }

    pub fn disconnect(&self, id: &str) -> bool {
        let socket = id.parse::<Sid>().ok().and_then(|sid| self.io.get_socket(sid));
        socket.is_some_and(|s| s.disconnect().is_ok())
    }
}

#[cfg(test)]
#[path = "server_tests.rs"]
mod tests;
