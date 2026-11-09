//! Who may connect: LAN peers holding the pairing secret, within rate limits.
//!
//! Each server start gets two fresh secrets: a 128-bit token (QR code and SDK) and a 6-digit
//! code for typing by hand. The code is short, so after too many failed attempts across all
//! peers it stops being accepted until the window passes; the token keeps working.
use std::collections::{HashMap, VecDeque};
use std::fmt;
use std::net::IpAddr;
use std::time::{Duration, Instant};

const WINDOW: Duration = Duration::from_secs(60);
const MAX_ATTEMPTS_PER_IP: usize = 20;
const MAX_FAILURES: usize = 10;
const MAX_TRACKED_IPS: usize = 1024;
pub const MAX_DEVICES: usize = 8;
const CODE_SPACE: u32 = 1_000_000;
// Largest multiple of CODE_SPACE below u32::MAX, so `n % CODE_SPACE` is unbiased.
const CODE_LIMIT: u32 = u32::MAX - u32::MAX % CODE_SPACE;

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

    fn matches(&self, offered: &str, code_allowed: bool) -> bool {
        // Evaluate both so timing doesn't reveal which one was close.
        let token = constant_time_eq(offered.as_bytes(), self.token.as_bytes());
        let code = constant_time_eq(offered.as_bytes(), self.code.as_bytes());
        token | (code & code_allowed)
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
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

#[derive(Default)]
pub struct Guard {
    attempts: HashMap<IpAddr, VecDeque<Instant>>,
    failures: VecDeque<Instant>,
}

impl Guard {
    /// Decides one connection attempt. Every attempt counts towards the per-peer limit.
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
        if !self.attempts.contains_key(&ip) && self.attempts.len() >= MAX_TRACKED_IPS {
            return Err(Reject::RateLimited);
        }
        let tries = self.attempts.entry(ip).or_default();
        if tries.len() >= MAX_ATTEMPTS_PER_IP {
            return Err(Reject::RateLimited);
        }
        tries.push_back(now);
        let code_allowed = self.failures.len() < MAX_FAILURES;
        if !offered.is_some_and(|o| secrets.matches(o, code_allowed)) {
            self.failures.push_back(now);
            return Err(Reject::Unauthorized);
        }
        if devices >= MAX_DEVICES {
            return Err(Reject::TooManyDevices);
        }
        Ok(())
    }

    fn prune(&mut self, now: Instant) {
        let fresh = |t: &Instant| now.duration_since(*t) < WINDOW;
        self.failures.retain(fresh);
        self.attempts.retain(|_, tries| {
            tries.retain(fresh);
            !tries.is_empty()
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

    #[test]
    fn locks_the_code_after_failures_from_anywhere() {
        let mut guard = Guard::default();
        let now = Instant::now();
        for n in 0..MAX_FAILURES as u8 {
            assert_eq!(guard.admit(lan(10 + n), Some("000000"), &secrets(), 0, now), Err(Reject::Unauthorized));
        }
        assert_eq!(guard.admit(lan(99), Some("042137"), &secrets(), 0, now), Err(Reject::Unauthorized));
        assert_eq!(guard.admit(lan(99), Some(&secrets().token), &secrets(), 0, now), Ok(()));
        assert_eq!(guard.admit(lan(99), Some("042137"), &secrets(), 0, now + WINDOW), Ok(()));
    }

    #[test]
    fn caps_devices() {
        let mut guard = Guard::default();
        let result = guard.admit(lan(5), Some("042137"), &secrets(), MAX_DEVICES, Instant::now());
        assert_eq!(result, Err(Reject::TooManyDevices));
    }

    #[test]
    fn compares_in_constant_time_shape() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }
}
