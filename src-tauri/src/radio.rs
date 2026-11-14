//! Internet radio from Radio Browser (radio-browser.info): a free, community-run directory with no
//! account or key. Carbon only asks it for stations here; the webview's audio element plays the
//! stream. Answers are checked before they reach the webview: only http(s) streams it can play.
use serde::{Deserialize, Deserializer, Serialize};
use std::net::IpAddr;
use std::time::Duration;
use tauri::State;

/// Radio Browser's round-robin name for whichever of its servers is up.
const API: &str = "https://all.api.radio-browser.info/json";
const TIMEOUT: Duration = Duration::from_secs(15);
const MAX_QUERY: usize = 100;
const MAX_TEXT: usize = 200;
const MAX_URL: usize = 1024;
const MAX_TAGS: usize = 4;
const PAGE: usize = 60;
/// What the webview's audio element plays without help (no HLS, no Flash-era formats).
const CODECS: [&str; 5] = ["MP3", "AAC", "AAC+", "OGG", "FLAC"];

pub struct Radio(reqwest::Client);

impl Radio {
    pub fn new(version: &str) -> Self {
        // Radio Browser asks every client to say who it is.
        let agent = format!("Carbon/{version} (https://getcarbon.cc)");
        Self(reqwest::Client::builder().timeout(TIMEOUT).user_agent(agent).build().unwrap_or_default())
    }
}

/// Radio Browser sends numbers as numbers on some servers and as strings on others.
fn number<'de, D: Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Loose {
        Number(u32),
        Text(String),
    }
    Ok(match Loose::deserialize(d)? {
        Loose::Number(n) => n,
        Loose::Text(s) => s.trim().parse().unwrap_or(0),
    })
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawStation {
    stationuuid: String,
    name: String,
    url_resolved: String,
    favicon: String,
    tags: String,
    countrycode: String,
    codec: String,
    #[serde(deserialize_with = "number")]
    bitrate: u32,
    #[serde(deserialize_with = "number")]
    hls: u32,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    id: String,
    name: String,
    stream_url: String,
    /// https only (the webview's image policy); None shows Carbon's radio icon.
    icon: Option<String>,
    tags: Vec<String>,
    country: String,
    codec: String,
    bitrate: u32,
}

fn clip(text: &str, max: usize) -> String {
    text.trim().chars().filter(|c| !c.is_control()).take(max).collect()
}

fn web_url(url: &str, schemes: &[&str]) -> Option<String> {
    let url = url.trim();
    let ok = url.len() <= MAX_URL && schemes.iter().any(|s| url.starts_with(s)) && !url.chars().any(|c| c.is_control() || c.is_whitespace());
    ok.then(|| url.to_string())
}

/// A stream address on the public internet. The directory is community-edited, so an entry naming
/// this PC or something on the listener's own network is refused rather than fetched on a click.
fn stream_url(url: &str) -> Option<String> {
    let text = web_url(url, &["https://", "http://"])?;
    let parsed = reqwest::Url::parse(&text).ok()?;
    let host = parsed.host_str()?.trim_start_matches('[').trim_end_matches(']').to_ascii_lowercase();
    let local_name = host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") || !host.contains('.') && !host.contains(':');
    let local_ip = host.parse::<IpAddr>().is_ok_and(|ip| ip.is_unspecified() || crate::remote::is_lan(ip));
    (!local_name && !local_ip).then_some(text)
}

fn is_uuid(id: &str) -> bool {
    id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}

/// A station Carbon can show and play, or None for one it can't (HLS, an odd codec, a bad address).
fn station(raw: RawStation) -> Option<Station> {
    let codec = raw.codec.trim().to_ascii_uppercase();
    let name = clip(&raw.name, MAX_TEXT);
    if !is_uuid(&raw.stationuuid) || name.is_empty() || raw.hls != 0 || !CODECS.contains(&codec.as_str()) {
        return None;
    }
    Some(Station {
        id: raw.stationuuid,
        name,
        stream_url: stream_url(&raw.url_resolved)?,
        icon: web_url(&raw.favicon, &["https://"]),
        tags: raw.tags.split(',').map(|t| clip(t, 32)).filter(|t| !t.is_empty()).take(MAX_TAGS).collect(),
        country: clip(&raw.countrycode, 2).to_ascii_uppercase(),
        codec,
        bitrate: raw.bitrate,
    })
}

/// One malformed entry (a null where text belongs) costs that station, not the whole list.
fn stations(raw: Vec<serde_json::Value>) -> Vec<Station> {
    raw.into_iter().filter_map(|entry| serde_json::from_value::<RawStation>(entry).ok()).filter_map(station).collect()
}

async fn fetch(radio: &Radio, path: &str, query: &[(&str, &str)]) -> Result<Vec<Station>, String> {
    let limit = PAGE.to_string();
    let base = [("hidebroken", "true"), ("order", "clickcount"), ("reverse", "true"), ("limit", limit.as_str())];
    let url = reqwest::Url::parse_with_params(&format!("{API}/{path}"), base.iter().chain(query)).map_err(|e| e.to_string())?;
    let res = radio.0.get(url).send().await.map_err(|e| {
        eprintln!("[radio] {path} failed: {}", e.without_url());
        "Can't reach the radio directory. Check your connection.".to_string()
    })?;
    if !res.status().is_success() {
        eprintln!("[radio] {path} answered {}", res.status());
        return Err("The radio directory is having trouble right now. Try again shortly.".into());
    }
    let raw: Vec<serde_json::Value> = res.json().await.map_err(|e| {
        eprintln!("[radio] {path} sent something unreadable: {}", e.without_url());
        "The radio directory sent something Carbon can't read.".to_string()
    })?;
    Ok(stations(raw))
}

/// Stations by name, by tag ("jazz"), or the most listened-to when both are empty.
#[tauri::command]
pub async fn radio_stations(radio: State<'_, Radio>, name: String, tag: String) -> Result<Vec<Station>, String> {
    let (name, tag) = (clip(&name, MAX_QUERY), clip(&tag, MAX_QUERY).to_lowercase());
    if name.is_empty() && tag.is_empty() {
        return fetch(&radio, "stations/topclick", &[]).await;
    }
    fetch(&radio, "stations/search", &[("name", name.as_str()), ("tag", tag.as_str())]).await
}

/// Tells the directory a station was played, which is how it ranks them (its API asks clients to).
#[tauri::command]
pub async fn radio_played(radio: State<'_, Radio>, id: String) -> Result<(), String> {
    if !is_uuid(&id) {
        return Err("That isn't a station Carbon knows.".into());
    }
    if let Err(e) = radio.0.get(format!("{API}/url/{id}")).send().await {
        eprintln!("[radio] play count failed: {}", e.without_url());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "d28420a4-eccf-47a2-ace1-088c7e7cb7e0";

    fn raw(json: &str) -> RawStation {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn reads_a_station_whether_numbers_come_as_text_or_not() {
        let text = raw(&format!(
            r#"{{"stationuuid":"{ID}","name":" 101 SMOOTH JAZZ ","url_resolved":"http://example.com/128mp3","favicon":"http://example.com/favicon.ico","tags":"easy listening,jazz,,smooth jazz,a,b","countrycode":"us","codec":"mp3","bitrate":"192","hls":"0"}}"#
        ));
        let found = station(text).unwrap();
        assert_eq!(found.name, "101 SMOOTH JAZZ");
        assert_eq!(found.stream_url, "http://example.com/128mp3");
        assert_eq!(found.icon, None); // an http icon would be blocked by the webview
        assert_eq!(found.tags, ["easy listening", "jazz", "smooth jazz", "a"]);
        assert_eq!((found.country.as_str(), found.codec.as_str(), found.bitrate), ("US", "MP3", 192));
        let numbers = raw(&format!(r#"{{"stationuuid":"{ID}","name":"N","url_resolved":"https://s.example/a","favicon":"https://s.example/i.png","codec":"AAC+","bitrate":64,"hls":0}}"#));
        assert_eq!(station(numbers).unwrap().icon.as_deref(), Some("https://s.example/i.png"));
    }

    #[test]
    fn leaves_out_stations_the_webview_cannot_play_or_trust() {
        let with = |field: &str, value: serde_json::Value| {
            let mut json = serde_json::json!({ "stationuuid": ID, "name": "N", "url_resolved": "https://s.example/a", "codec": "MP3" });
            json[field] = value;
            station(serde_json::from_value(json).unwrap())
        };
        assert!(with("hls", 1.into()).is_none());
        assert!(with("codec", "WMA".into()).is_none());
        assert!(with("url_resolved", "javascript:alert(1)".into()).is_none());
        assert!(with("url_resolved", "file:///c:/x.mp3".into()).is_none());
        assert!(with("url_resolved", "https://s.example/a b".into()).is_none());
        assert!(with("stationuuid", "../etc".into()).is_none());
        assert!(with("name", "   ".into()).is_none());
        assert!(with("bitrate", "n/a".into()).is_some());
    }

    #[test]
    fn refuses_streams_on_this_pc_or_the_local_network() {
        for local in ["http://localhost:8000/a", "http://127.0.0.1/a", "http://192.168.1.10:8000/a", "http://10.0.0.2/a", "http://[::1]/a", "http://0.0.0.0/a", "http://nas/a", "http://printer.local/a", "http://169.254.1.1/a"] {
            assert_eq!(stream_url(local), None, "{local}");
        }
        assert_eq!(stream_url("http://stream.example.com:8000/live").as_deref(), Some("http://stream.example.com:8000/live"));
        assert_eq!(stream_url("https://8.8.8.8/live").as_deref(), Some("https://8.8.8.8/live"));
    }

    #[test]
    fn one_malformed_entry_does_not_cost_the_list() {
        let good = serde_json::json!({ "stationuuid": ID, "name": "N", "url_resolved": "https://s.example/a", "codec": "MP3" });
        let bad = serde_json::json!({ "stationuuid": ID, "name": null, "bitrate": -3.5 });
        assert_eq!(stations(vec![bad, good, serde_json::json!("nonsense")]).len(), 1);
    }

    #[test]
    fn recognises_station_ids() {
        assert!(is_uuid(ID));
        assert!(!is_uuid("d28420a4"));
        assert!(!is_uuid("d28420a4-eccf-47a2-ace1-088c7e7cb7e/"));
    }
}
