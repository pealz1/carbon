//! Phone remote and developer SDK access over the LAN (Settings → Remote). Off by default.
//! Remotes see what's playing and send the few commands in `protocol`; nothing else.
mod assets;
mod guard;
pub(crate) use guard::is_lan;
mod http;
pub mod protocol;
mod server;
mod widgets;

use crate::media_controls;
use crate::playback::PlaybackInfo;
use protocol::RemoteState;
use qrcode::QrCode;
use qrcode::render::svg;
use serde::Serialize;
use server::{Context, Device, Server};
use std::net::{IpAddr, Ipv4Addr, TcpListener, UdpSocket};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::watch;

pub const DEFAULT_PORT: u16 = 10767;
const CHANGED_EVENT: &str = "remote-changed";
const QR_SIZE: u32 = 240;

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    running: bool,
    port: Option<u16>,
    url: Option<String>,
    pairing_url: Option<String>,
    code: Option<String>,
    token: Option<String>,
    qr_svg: Option<String>,
    devices: Vec<Device>,
    error: Option<String>,
}

pub struct Remote {
    app: AppHandle,
    state: watch::Sender<Option<RemoteState>>,
    server: Mutex<Option<Server>>,
    error: Mutex<Option<String>>,
    /// What the streamer widgets show; kept whether or not they're on.
    playing: widgets::Playing,
    widgets: Mutex<Option<widgets::Widgets>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn notify(app: &AppHandle) {
    if let Err(e) = app.emit(CHANGED_EVENT, ()) {
        eprintln!("[remote] could not notify the window: {e}");
    }
}

/// The address other devices reach this PC on: the interface holding the default route.
/// Connecting a UDP socket sends nothing; it only picks the route.
fn lan_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.connect((Ipv4Addr::new(192, 0, 2, 1), 9)).ok()?;
    socket.local_addr().ok().map(|a| a.ip()).filter(|ip| !ip.is_unspecified())
}

/// Runs async server work to completion from sync code. A scoped thread keeps this safe even if
/// the caller is itself on a runtime thread, where a direct block_on would panic.
fn block_on<F: Future + Send>(future: F) -> F::Output
where
    F::Output: Send,
{
    std::thread::scope(|scope| scope.spawn(|| tauri::async_runtime::block_on(future)).join())
        .unwrap_or_else(|panic| std::panic::resume_unwind(panic))
}

fn qr_svg(text: &str) -> Option<String> {
    let code = QrCode::new(text.as_bytes()).ok()?;
    let image = code
        .render::<svg::Color>()
        .min_dimensions(QR_SIZE, QR_SIZE)
        .dark_color(svg::Color("#10100d"))
        .light_color(svg::Color("#f1f1f4"))
        .build();
    Some(image)
}

fn bind(port: u16) -> Result<TcpListener, String> {
    TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).map_err(|e| match e.kind() {
        std::io::ErrorKind::AddrInUse => format!("port {port} is already in use, pick another"),
        std::io::ErrorKind::PermissionDenied => format!("Windows didn't allow Carbon to use port {port}"),
        _ => format!("couldn't start the remote on port {port}: {e}"),
    })
}

/// This PC only: nothing off the machine can reach a listener bound to 127.0.0.1.
fn bind_widgets() -> Result<TcpListener, String> {
    let port = widgets::PORT;
    TcpListener::bind((Ipv4Addr::LOCALHOST, port)).map_err(|e| match e.kind() {
        std::io::ErrorKind::AddrInUse => format!("the streamer widgets need port {port}, and another program is using it"),
        _ => format!("couldn't start the streamer widgets on port {port}: {e}"),
    })
}

impl Remote {
    pub fn new(app: &AppHandle) -> Self {
        Self {
            app: app.clone(),
            state: watch::Sender::new(None),
            server: Mutex::default(),
            error: Mutex::default(),
            playing: widgets::Playing::default(),
            widgets: Mutex::default(),
        }
    }

    /// Called for every playback report; the server decides what to send and when.
    pub fn publish(&self, info: Option<&PlaybackInfo>) {
        let state = info.map(RemoteState::from);
        *lock(&self.playing) = state.clone().map(|state| (state, Instant::now()));
        self.state.send_replace(state);
    }

    /// Starts or stops the streamer widgets (remote/widgets.rs) to match settings.
    pub fn apply_widgets(&self, enabled: bool) -> Result<(), String> {
        let mut slot = lock(&self.widgets);
        if slot.is_some() == enabled {
            return Ok(());
        }
        match slot.take() {
            Some(running) => block_on(running.stop()),
            None => *slot = Some(block_on(widgets::start(bind_widgets()?, self.playing.clone()))?),
        }
        Ok(())
    }

    /// Starts, stops or moves the server to match settings.
    pub fn apply(&self, enabled: bool, port: u16) -> Result<(), String> {
        let mut slot = lock(&self.server);
        if slot.as_ref().map(|s| s.port) == enabled.then_some(port) {
            return Ok(());
        }
        if let Some(old) = slot.take() {
            block_on(old.stop());
        }
        let result = if enabled { self.start(port).map(|s| *slot = Some(s)) } else { Ok(()) };
        *lock(&self.error) = result.as_ref().err().cloned();
        drop(slot);
        notify(&self.app);
        result
    }

    fn start(&self, port: u16) -> Result<Server, String> {
        let listener = bind(port)?;
        let (commands, changes) = (self.app.clone(), self.app.clone());
        let ctx = Context {
            state: self.state.subscribe(),
            on_command: Arc::new(move |command| media_controls::emit(&commands, command)),
            on_change: Arc::new(move || notify(&changes)),
            app_version: self.app.package_info().version.to_string(),
        };
        block_on(server::start(listener, ctx))
    }

    fn status(&self) -> RemoteStatus {
        let error = lock(&self.error).clone();
        let slot = lock(&self.server);
        let Some(server) = slot.as_ref() else { return RemoteStatus { error, ..RemoteStatus::default() } };
        let secrets = server.secrets();
        let host = lan_ip().unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));
        let url = format!("http://{host}:{}", server.port);
        let pairing_url = format!("{url}/#token={}", secrets.token);
        RemoteStatus {
            running: true,
            port: Some(server.port),
            qr_svg: qr_svg(&pairing_url),
            url: Some(url),
            pairing_url: Some(pairing_url),
            code: Some(secrets.code),
            token: Some(secrets.token),
            devices: server.devices(),
            error,
        }
    }
}

#[tauri::command]
pub fn remote_status(remote: State<Remote>) -> RemoteStatus {
    remote.status()
}

/// New pairing secrets; every connected remote is signed out.
#[tauri::command]
pub fn remote_rotate(remote: State<Remote>) -> Result<RemoteStatus, String> {
    lock(&remote.server).as_ref().ok_or("the remote isn't on")?.rotate()?;
    notify(&remote.app);
    Ok(remote.status())
}

#[tauri::command]
pub fn remote_disconnect(remote: State<Remote>, id: String) -> Result<(), String> {
    let slot = lock(&remote.server);
    let server = slot.as_ref().ok_or("the remote isn't on")?;
    if server.disconnect(&id) { Ok(()) } else { Err("that device is no longer connected".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_a_qr_code() {
        let svg = qr_svg("http://192.168.1.20:10767/#token=0123456789abcdef0123456789abcdef").unwrap();
        assert!(svg.starts_with("<?xml") && svg.contains("<svg"));
    }

    #[tokio::test]
    async fn blocks_safely_even_from_a_runtime_thread() {
        assert_eq!(block_on(async { 7 }), 7);
    }
}
