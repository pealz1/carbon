//! Shared response and URL validation for catalog requests.
use serde_json::Value;
const MAX_URL: usize = 1024;
const MAX_ID: usize = 20;
fn offline(e: reqwest::Error, name: &str) -> String {
    eprintln!("[{}] request failed: {}", name.to_lowercase(), e.without_url());
    format!("Can't reach {name}. Check your connection.")
}

fn explain_status(status: u16, name: &str) -> String {
    match status {
        401 | 403 => format!("{name} refused that. It may not be available where you are."),
        404 => format!("{name} doesn't have that any more."),
        429 => format!("{name} is asking Carbon to slow down. Try again in a minute."),
        500.. => format!("{name} is having trouble right now. Try again shortly."),
        _ => format!("{name} answered with an error ({status})."),
    }
}

/// A successful answer's body, refused when it is larger than `max`.
pub(crate) async fn body(res: Result<reqwest::Response, reqwest::Error>, name: &str, max: usize) -> Result<Vec<u8>, String> {
    let mut res = res.map_err(|e| offline(e, name))?;
    let status = res.status().as_u16();
    if !(200..300).contains(&status) {
        eprintln!("[{}] answered {status}", name.to_lowercase());
        return Err(explain_status(status, name));
    }
    let too_big = || format!("{name} sent more than Carbon expected.");
    if res.content_length().is_some_and(|n| n as usize > max) {
        return Err(too_big());
    }
    let mut bytes=Vec::new();
    while let Some(chunk)=res.chunk().await.map_err(|e|offline(e,name))? {
        if chunk.len()>max.saturating_sub(bytes.len()){return Err(too_big());}
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub(crate) fn parse(bytes: &[u8], name: &str) -> Result<Value, String> {
    serde_json::from_slice(bytes).map_err(|e| {
        eprintln!("[{}] unreadable answer: {e}", name.to_lowercase());
        format!("{name} sent something Carbon can't read.")
    })
}

/// An https address on one of `hosts` (the name itself or anything under it), or None.
pub(crate) fn https_on(url: &str, hosts: &[&str]) -> Option<String> {
    if url.len() > MAX_URL || !url.starts_with("https://") || url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return None;
    }
    let parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?;
    let plain = parsed.username().is_empty() && parsed.password().is_none() && parsed.port().is_none();
    let known = hosts.iter().any(|h| host == *h || host.strip_suffix(h).is_some_and(|rest| rest.ends_with('.')));
    (plain && known).then(|| url.to_string())
}

/// A service's numeric id, as the webview sends it.
pub(crate) fn check_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty() && id.len() <= MAX_ID && id.bytes().all(|b| b.is_ascii_digit());
    ok.then_some(()).ok_or_else(|| "That isn't an id Carbon knows.".to_string())
}
