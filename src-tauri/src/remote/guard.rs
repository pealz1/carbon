//! Who may connect: LAN peers holding the pairing secret, within rate limits.
//!
//! Each server start gets two fresh secrets: a 128-bit token (QR code and SDK) and a 6-digit
//! code for typing by hand. The code is short, so a peer that keeps getting it wrong may only use
//! the token until the window passes, and many failures across the LAN space code attempts out
//! for everyone who hasn't paired yet. The token always works.
use axum::http::{HeaderMap, header};
use std::collections::{HashMap, VecDeque};
use std::fmt;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, Instant};

const WINDOW: Duration = Duration::from_secs(60);
const MAX_ATTEMPTS_PER_IP: usize = 20;
/// Wrong secrets from one peer per window before it may only use the token.
const MAX_FAILURES_PER_IP: usize = 10;
/// Wrong secrets from the whole LAN per window before code attempts are spaced out. Well above the
/// per-peer limit, so one device alone never slows anyone else down.
const GLOBAL_FAILURES: usize = 30;
const BACKOFF_STEP: Duration = Duration::from_millis(250);
/// The backoff only ever slows the code down; it never turns it off.
const MAX_BACKOFF: Duration = Duration::from_secs(10);
const MAX_TRACKED_IPS: usize = 1024;
pub const MAX_DEVICES: usize = 8;
const CODE_SPACE: u32 = 1_000_000;
// Largest multiple of CODE_SPACE below u32::MAX, so `n % CODE_SPACE` is unbiased.
const CODE_LIMIT: u32 = u32::MAX - u32::MAX % CODE_SPACE;
/// Commands a remote may send at once, then per second; a held-down button stays well inside it.
const COMMAND_BURST: f64 = 20.0;
const COMMANDS_PER_SECOND: f64 = 20.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Reject {
    Forbidden,
    RateLimited,
    Unauthorized,
    TooManyDevices,
}

/// Sent to the client as the `connect_error` message.
impl fmt::Display for Reject {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Forbidden => "forbidden",
            Self::RateLimited => "rate_limited",
            Self::Unauthorized => "unauthorized",
            Self::TooManyDevices => "too_many_devices",
        })
    }
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Secrets {
    pub token: String,
    pub code: String,
}

fn random_bytes<const N: usize>() -> Result<[u8; N], String> {
    let mut bytes = [0u8; N];
    getrandom::fill(&mut bytes).map_err(|e| format!("no secure random source: {e}"))?;
    Ok(bytes)
}

impl Secrets {
    pub fn generate() -> Result<Self, String> {
        let token = random_bytes::<16>()?.iter().map(|b| format!("{b:02x}")).collect();
        let code = loop {
            let n = u32::from_le_bytes(random_bytes::<4>()?);
            if n < CODE_LIMIT {
                break format!("{:06}", n % CODE_SPACE);
            }
        };
        Ok(Self { token, code })
    }

    fn is_token(&self, offered: &str) -> bool {
        constant_time_eq(offered.as_bytes(), self.token.as_bytes())
    }

    pub fn is_code(&self, offered: &str) -> bool {
        constant_time_eq(offered.as_bytes(), self.code.as_bytes())
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// One remote's command allowance: a token bucket.
pub struct CommandBudget {
    tokens: f64,
    at: Instant,
    warned: bool,
}

impl CommandBudget {
    pub fn new(now: Instant) -> Self {
        Self { tokens: COMMAND_BURST, at: now, warned: false }
    }

    pub fn spend(&mut self, now: Instant) -> bool {
        let refill = now.saturating_duration_since(self.at).as_secs_f64() * COMMANDS_PER_SECOND;
        self.tokens = (self.tokens + refill).min(COMMAND_BURST);
        self.at = now;
        let allowed = self.tokens >= 1.0;
        if allowed {
            self.tokens -= 1.0;
        }
        allowed
    }

    /// True the first time only, so a flood is logged once per remote.
    pub fn first_overflow(&mut self) -> bool {
        !std::mem::replace(&mut self.warned, true)
    }
}

/// Private, loopback and link-local addresses only: the server binds every interface, but
/// this is what keeps it a LAN service.
pub fn is_lan(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || v6.to_ipv4_mapped().is_some_and(|v4| is_lan(IpAddr::V4(v4)))
        }
    }
}

/// `1.2.3.4`, `[::1]`, or either with `port`. A name means DNS rebinding (or a hosts-file alias).
fn is_ip_host(host: &str, port: u16) -> bool {
    match host.parse::<SocketAddr>() {
        Ok(addr) => addr.port() == port,
        Err(_) => {
            host.parse::<Ipv4Addr>().is_ok()
                || host.strip_prefix('[').and_then(|h| h.strip_suffix(']')).is_some_and(|h| h.parse::<Ipv6Addr>().is_ok())
        }
    }
}

/// Keeps other websites out: the Host must be an IP literal for this server (stops DNS
/// rebinding), and an Origin, if sent, must be the remote's own page (stops cross-site
/// websockets). Native clients send no Origin; they still need a secret.
pub fn check_request(headers: &HeaderMap, port: u16) -> Result<(), Reject> {
    let text = |name| headers.get(name).map(|v: &header::HeaderValue| v.to_str().map_err(|_| Reject::Forbidden)).transpose();
    let host = text(header::HOST)?.filter(|h| is_ip_host(h, port)).ok_or(Reject::Forbidden)?;
    match text(header::ORIGIN)? {
        Some(origin) if origin.strip_prefix("http://") != Some(host) => Err(Reject::Forbidden),
        _ => Ok(()),
    }
}

struct Peer {
    attempts: VecDeque<Instant>,
    failures: VecDeque<Instant>,
    /// Has paired: outlives its window, is the last to be forgotten when the table is full, and
    /// skips the LAN-wide backoff.
    trusted: bool,
    seen: Instant,
}

#[derive(Default)]
pub struct Guard {
    peers: HashMap<IpAddr, Peer>,
    failures: VecDeque<Instant>,
    code_paused_until: Option<Instant>,
}

impl Guard {
    /// Decides one connection attempt. Every attempt counts towards the per-peer limit; the token
    /// is never locked out.
    pub fn admit(
        &mut self,
        ip: Option<IpAddr>,
        offered: Option<&str>,
        secrets: &Secrets,
        devices: usize,
        now: Instant,
    ) -> Result<(), Reject> {
        let ip = ip.filter(|ip| is_lan(*ip)).ok_or(Reject::Forbidden)?;
        self.prune(now);
        let paused = self.code_paused_until.is_some_and(|until| now < until);
        let peer = self.peer(ip, now);
        if peer.attempts.len() >= MAX_ATTEMPTS_PER_IP {
            return Err(Reject::RateLimited);
        }
        peer.attempts.push_back(now);
        let offered = offered.unwrap_or_default();
        if !secrets.is_token(offered) {
            // Not compared at all, so these attempts can't count as guesses.
            if peer.failures.len() >= MAX_FAILURES_PER_IP || (paused && !peer.trusted) {
                return Err(Reject::RateLimited);
            }
            if !secrets.is_code(offered) {
                peer.failures.push_back(now);
                self.failed(now);
                return Err(Reject::Unauthorized);
            }
        }
        peer.trusted = true;
        if devices >= MAX_DEVICES {
            return Err(Reject::TooManyDevices);
        }
        Ok(())
    }

    /// The record for `ip`. A full table forgets the stalest stranger, or failing that the stalest
    /// trusted peer, so a flood of new addresses can't push out paired devices or lock anyone out.
    fn peer(&mut self, ip: IpAddr, now: Instant) -> &mut Peer {
        if !self.peers.contains_key(&ip) && self.peers.len() >= MAX_TRACKED_IPS {
            let stalest = self.peers.iter().min_by_key(|(_, p)| (p.trusted, p.seen)).map(|(ip, _)| *ip);
            if let Some(stalest) = stalest {
                self.peers.remove(&stalest);
            }
        }
        let peer = self.peers.entry(ip).or_insert_with(|| Peer {
            attempts: VecDeque::new(),
            failures: VecDeque::new(),
            trusted: false,
            seen: now,
        });
        peer.seen = now;
        peer
    }

    /// Past GLOBAL_FAILURES, each failure doubles the wait before the code is checked again.
    fn failed(&mut self, now: Instant) {
        self.failures.push_back(now);
        let excess = self.failures.len().saturating_sub(GLOBAL_FAILURES);
        if excess > 0 {
            let wait = BACKOFF_STEP.saturating_mul(2u32.saturating_pow(excess as u32)).min(MAX_BACKOFF);
            self.code_paused_until = Some(now + wait);
        }
    }

    fn prune(&mut self, now: Instant) {
        let fresh = |t: &Instant| now.duration_since(*t) < WINDOW;
        self.failures.retain(fresh);
        self.peers.retain(|_, peer| {
            peer.attempts.retain(fresh);
            peer.failures.retain(fresh);
            peer.trusted || !peer.attempts.is_empty()
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secrets() -> Secrets {
        Secrets { token: "0123456789abcdef0123456789abcdef".into(), code: "042137".into() }
    }

    fn lan(n: u8) -> Option<IpAddr> {
        Some(IpAddr::from([192, 168, 1, n]))
    }

    #[test]
    fn generates_fresh_well_formed_secrets() {
        let a = Secrets::generate().unwrap();
        let b = Secrets::generate().unwrap();
        assert_eq!(a.token.len(), 32);
        assert!(a.token.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(a.code.len(), 6);
        assert!(a.code.chars().all(|c| c.is_ascii_digit()));
        assert_ne!(a.token, b.token);
    }

    #[test]
    fn accepts_the_token_or_the_code() {
        let mut guard = Guard::default();
        let now = Instant::now();
        assert_eq!(guard.admit(lan(2), Some("042137"), &secrets(), 0, now), Ok(()));
        assert_eq!(guard.admit(lan(2), Some(&secrets().token), &secrets(), 0, now), Ok(()));
        assert_eq!(guard.admit(lan(2), Some("042138"), &secrets(), 0, now), Err(Reject::Unauthorized));
        assert_eq!(guard.admit(lan(2), None, &secrets(), 0, now), Err(Reject::Unauthorized));
        assert_eq!(guard.admit(lan(2), Some(""), &secrets(), 0, now), Err(Reject::Unauthorized));
    }

    #[test]
    fn only_admits_lan_peers() {
        let mut guard = Guard::default();
        let now = Instant::now();
        let public = Some(IpAddr::from([8, 8, 8, 8]));
        assert_eq!(guard.admit(public, Some("042137"), &secrets(), 0, now), Err(Reject::Forbidden));
        assert_eq!(guard.admit(None, Some("042137"), &secrets(), 0, now), Err(Reject::Forbidden));
        assert!(is_lan("10.0.0.5".parse().unwrap()));
        assert!(is_lan("127.0.0.1".parse().unwrap()));
        assert!(is_lan("fe80::1".parse().unwrap()));
        assert!(is_lan("::ffff:192.168.0.9".parse().unwrap()));
        assert!(!is_lan("2001:4860::8888".parse().unwrap()));
    }

    #[test]
    fn limits_attempts_per_peer() {
        let mut guard = Guard::default();
        let now = Instant::now();
        for _ in 0..MAX_ATTEMPTS_PER_IP {
            assert_eq!(guard.admit(lan(3), Some("042137"), &secrets(), 0, now), Ok(()));
        }
        assert_eq!(guard.admit(lan(3), Some("042137"), &secrets(), 0, now), Err(Reject::RateLimited));
        assert_eq!(guard.admit(lan(4), Some("042137"), &secrets(), 0, now), Ok(()));
        assert_eq!(guard.admit(lan(3), Some("042137"), &secrets(), 0, now + WINDOW), Ok(()));
    }

    /// `count` wrong codes from each of `peers` addresses starting at 10.0.0.0.
    fn guess(guard: &mut Guard, peers: usize, count: usize, now: Instant) {
        for n in 0..peers {
            let ip = IpAddr::from([10, 0, (n >> 8) as u8, n as u8]);
            for _ in 0..count {
                assert_ne!(guard.admit(Some(ip), Some("000000"), &secrets(), 0, now), Ok(()));
            }
        }
    }

    #[test]
    fn locks_the_code_for_the_guessing_peer_only() {
        let mut guard = Guard::default();
        let now = Instant::now();
        for _ in 0..MAX_FAILURES_PER_IP {
            assert_eq!(guard.admit(lan(10), Some("000000"), &secrets(), 0, now), Err(Reject::Unauthorized));
        }
        assert_eq!(guard.admit(lan(10), Some("042137"), &secrets(), 0, now), Err(Reject::RateLimited));
        assert_eq!(guard.admit(lan(10), Some(&secrets().token), &secrets(), 0, now), Ok(()));
        assert_eq!(guard.admit(lan(11), Some("042137"), &secrets(), 0, now), Ok(()), "everyone else unaffected");
        assert_eq!(guard.admit(lan(10), Some("042137"), &secrets(), 0, now + WINDOW), Ok(()));
    }

    #[test]
    fn slows_the_code_lan_wide_but_never_the_token_or_paired_peers() {
        let mut guard = Guard::default();
        let start = Instant::now();
        assert_eq!(guard.admit(lan(1), Some(&secrets().token), &secrets(), 0, start), Ok(()));
        let now = start + WINDOW; // the paired peer's own window has passed; it stays trusted
        guess(&mut guard, GLOBAL_FAILURES / MAX_FAILURES_PER_IP + 1, MAX_FAILURES_PER_IP, now);
        assert_eq!(guard.admit(lan(99), Some("042137"), &secrets(), 0, now), Err(Reject::RateLimited));
        assert_eq!(guard.admit(lan(98), Some(&secrets().token), &secrets(), 0, now), Ok(()));
        assert_eq!(guard.admit(lan(1), Some("042137"), &secrets(), 0, now), Ok(()));
        assert_eq!(guard.admit(lan(99), Some("042137"), &secrets(), 0, now + MAX_BACKOFF), Ok(()), "only slowed");
    }

    #[test]
    fn a_full_table_forgets_strangers_before_paired_peers() {
        let mut guard = Guard::default();
        let start = Instant::now();
        assert_eq!(guard.admit(lan(1), Some(&secrets().token), &secrets(), 0, start), Ok(()));
        let now = start + Duration::from_secs(1);
        guess(&mut guard, MAX_TRACKED_IPS, 1, now);
        assert_eq!(guard.peers.len(), MAX_TRACKED_IPS);
        assert_eq!(guard.admit(lan(2), Some(&secrets().token), &secrets(), 0, now), Ok(()), "a newcomer still gets in");
        assert_eq!(guard.peers.len(), MAX_TRACKED_IPS);
        // Still trusted, so the backoff the flood caused doesn't apply to it.
        assert_eq!(guard.admit(lan(1), Some("042137"), &secrets(), 0, now), Ok(()));
    }

    #[test]
    fn caps_devices() {
        let mut guard = Guard::default();
        let result = guard.admit(lan(5), Some("042137"), &secrets(), MAX_DEVICES, Instant::now());
        assert_eq!(result, Err(Reject::TooManyDevices));
    }

    fn request(host: Option<&str>, origin: Option<&[u8]>) -> Result<(), Reject> {
        let mut headers = HeaderMap::new();
        if let Some(host) = host {
            headers.insert(header::HOST, host.parse().unwrap());
        }
        if let Some(origin) = origin {
            headers.insert(header::ORIGIN, header::HeaderValue::from_bytes(origin).unwrap());
        }
        check_request(&headers, 10767)
    }

    #[test]
    fn only_takes_requests_for_an_ip_from_the_remote_itself_or_native_clients() {
        let ok = Ok(());
        let no = Err(Reject::Forbidden);
        assert_eq!(request(Some("192.168.1.20:10767"), None), ok);
        assert_eq!(request(Some("192.168.1.20"), None), ok);
        assert_eq!(request(Some("[fe80::1]:10767"), None), ok);
        assert_eq!(request(Some("[::1]"), None), ok);
        assert_eq!(request(Some("192.168.1.20:10767"), Some(b"http://192.168.1.20:10767")), ok);
        assert_eq!(request(Some("[::1]:10767"), Some(b"http://[::1]:10767")), ok);
        // DNS rebinding, hosts-file names, another port, no Host at all
        assert_eq!(request(Some("evil.example:10767"), None), no);
        assert_eq!(request(Some("localhost:10767"), None), no);
        assert_eq!(request(Some("192.168.1.20:80"), None), no);
        assert_eq!(request(Some("::1"), None), no);
        assert_eq!(request(None, None), no);
        // other websites, sandboxed frames, look-alikes
        assert_eq!(request(Some("192.168.1.20:10767"), Some(b"http://evil.example")), no);
        assert_eq!(request(Some("192.168.1.20:10767"), Some(b"null")), no);
        assert_eq!(request(Some("192.168.1.20:10767"), Some(b"https://192.168.1.20:10767")), no);
        assert_eq!(request(Some("192.168.1.20:10767"), Some(b"http://192.168.1.20:10768")), no);
        assert_eq!(request(Some("192.168.1.20:10767"), Some(b"http://192.168.1.20:10767/")), no);
        assert_eq!(request(Some("192.168.1.20:10767"), Some(b"http://\xff")), no);
    }

    #[test]
    fn lets_a_burst_of_commands_through_then_refills() {
        let now = Instant::now();
        let mut budget = CommandBudget::new(now);
        assert!((0..20).all(|_| budget.spend(now)));
        assert!(!budget.spend(now));
        assert!(budget.first_overflow());
        assert!(!budget.first_overflow());
        let later = now + Duration::from_millis(100);
        assert!(budget.spend(later) && budget.spend(later), "20 a second");
        assert!(!budget.spend(later));
        let idle = now + Duration::from_secs(5);
        assert!((0..20).all(|_| budget.spend(idle)));
        assert!(!budget.spend(idle), "never more than one burst saved up");
    }

    #[test]
    fn compares_in_constant_time_shape() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }
}
