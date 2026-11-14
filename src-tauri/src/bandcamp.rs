//! Bandcamp, through the JSON its own apps read: search, a release with its songs, an artist or
//! label with its discography. Everything is asked for by Bandcamp's numeric ids on bandcamp.com
//! itself, so no address from the webview is ever fetched. Streaming only: a song's address is the
//! free listening stream Bandcamp's own player uses, read again each time the song's turn comes
//! (they expire). Nothing is saved.
use crate::soundcloud::{body, check_id, https_on, parse};
use serde_json::{Value, json};
use std::time::Duration;
use tauri::State;

const NAME: &str = "Bandcamp";
const API: &str = "https://bandcamp.com/api";
const TIMEOUT: Duration = Duration::from_secs(15);
const MAX_RESPONSE: usize = 8 * 1024 * 1024;
const MAX_QUERY: usize = 100;
const MAX_RESULTS: usize = 24;
/// The stream every listener gets without an account.
const STREAM: &str = "mp3-128";

pub struct Bandcamp(reqwest::Client);

impl Bandcamp {
    pub fn new(version: &str) -> Self {
        Self(reqwest::Client::builder().timeout(TIMEOUT).user_agent(format!("Carbon/{version}")).build().unwrap_or_default())
    }

    async fn read(&self, request: reqwest::RequestBuilder) -> Result<Value, String> {
        answer(parse(&body(request.send().await, NAME, MAX_RESPONSE).await?, NAME)?)
    }
}

/// Bandcamp reports a missing release inside a successful answer.
fn answer(value: Value) -> Result<Value, String> {
    if value["error"] == true {
        eprintln!("[bandcamp] {}", value["error_message"].as_str().unwrap_or("error without a message"));
        return Err("Bandcamp doesn't have that any more.".into());
    }
    Ok(value)
}

fn clip(text: &str, max: usize) -> String {
    text.trim().chars().filter(|c| !c.is_control()).take(max).collect()
}

/// Where a release's details live: `kind` is "a" for an album or "t" for a single song.
fn release_url(band: &str, kind: &str, id: &str) -> Result<reqwest::Url, String> {
    check_id(band)?;
    check_id(id)?;
    if !matches!(kind, "a" | "t") {
        return Err("That isn't a kind of release Carbon knows.".into());
    }
    let params = [("band_id", band), ("tralbum_type", kind), ("tralbum_id", id)];
    reqwest::Url::parse_with_params(&format!("{API}/mobile/24/tralbum_details"), params).map_err(|e| e.to_string())
}

/// The first song's listening address in a release's details, if Bandcamp streams it: an address
/// on bandcamp.com that redirects to its audio host, or one on that host directly.
fn stream_of(release: &Value) -> Option<String> {
    https_on(release["tracks"][0]["streaming_url"][STREAM].as_str()?, &["bandcamp.com", "bcbits.com"])
}

/// What Bandcamp's search can be narrowed to: artists and labels ("b"), albums ("a") or songs ("t").
fn check_filter(filter: &str) -> Result<(), String> {
    matches!(filter, "b" | "a" | "t").then_some(()).ok_or_else(|| "That isn't something Carbon searches Bandcamp for.".to_string())
}

/// Artists and labels ("b"), albums ("a") or songs ("t") matching what was typed.
#[tauri::command]
pub async fn bandcamp_search(bandcamp: State<'_, Bandcamp>, query: String, filter: String) -> Result<Vec<Value>, String> {
    check_filter(&filter)?;
    let query = clip(&query, MAX_QUERY);
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let request = json!({ "search_text": query, "search_filter": filter, "full_page": false, "fan_id": null });
    let mut found = bandcamp.read(bandcamp.0.post(format!("{API}/bcsearch_public_api/1/autocomplete_elastic")).json(&request)).await?;
    let results = found["auto"]["results"].as_array_mut().map(std::mem::take).unwrap_or_default();
    Ok(results.into_iter().take(MAX_RESULTS).collect())
}

/// An album ("a") or a single song ("t") with its songs.
#[tauri::command]
pub async fn bandcamp_release(bandcamp: State<'_, Bandcamp>, band: String, kind: String, id: String) -> Result<Value, String> {
    bandcamp.read(bandcamp.0.get(release_url(&band, &kind, &id)?)).await
}

/// An artist or label and what they have released.
#[tauri::command]
pub async fn bandcamp_band(bandcamp: State<'_, Bandcamp>, id: String) -> Result<Value, String> {
    check_id(&id)?;
    let band: u64 = id.parse().map_err(|_| "That isn't an id Carbon knows.".to_string())?;
    bandcamp.read(bandcamp.0.post(format!("{API}/mobile/24/band_details")).json(&json!({ "band_id": band }))).await
}

/// The address the audio element plays a song from, read fresh for this play.
#[tauri::command]
pub async fn bandcamp_stream(bandcamp: State<'_, Bandcamp>, band: String, id: String) -> Result<String, String> {
    let release = bandcamp.read(bandcamp.0.get(release_url(&band, "t", &id)?)).await?;
    stream_of(&release).ok_or_else(|| "Bandcamp doesn't stream that song.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_release_addresses_from_ids_only() {
        let url = release_url("851846867", "a", "4061576051").unwrap();
        assert_eq!(url.as_str(), "https://bandcamp.com/api/mobile/24/tralbum_details?band_id=851846867&tralbum_type=a&tralbum_id=4061576051");
        assert!(release_url("1", "t", "2").is_ok());
        for (band, kind, id) in [("1", "p", "2"), ("", "a", "2"), ("1", "a", "2&x=1"), ("evil.example", "a", "2"), ("1", "a", "../2"), ("1", "", "2")] {
            assert!(release_url(band, kind, id).is_err(), "{band} {kind} {id}");
        }
    }

    #[test]
    fn takes_a_stream_only_from_bandcamps_own_hosts() {
        let with = |url: Value| json!({ "tracks": [{ "streaming_url": { "mp3-128": url } }] });
        for good in ["https://bandcamp.com/stream_redirect?enc=mp3-128&track_id=1&ts=1&t=x", "https://t4.bcbits.com/stream/abc/mp3-128/1?p=0&ts=1&t=x&token=y"] {
            assert_eq!(stream_of(&with(good.into())).as_deref(), Some(good));
        }
        assert_eq!(stream_of(&with("https://notbandcamp.com/stream_redirect?track_id=1".into())), None);
        assert_eq!(stream_of(&with("http://t4.bcbits.com/stream/abc".into())), None);
        assert_eq!(stream_of(&with("https://bcbits.com.evil.example/stream".into())), None);
        assert_eq!(stream_of(&with(Value::Null)), None);
        assert_eq!(stream_of(&json!({ "tracks": [{ "streaming_url": null }] })), None);
        assert_eq!(stream_of(&json!({ "tracks": [] })), None);
    }

    #[test]
    fn a_missing_release_is_a_plain_sentence() {
        let missing = json!({ "error": true, "error_message": "No such tralbum for band 1: 1" });
        assert_eq!(answer(missing).unwrap_err(), "Bandcamp doesn't have that any more.");
        assert!(answer(json!({ "id": 1, "tracks": [] })).is_ok());
    }

    #[test]
    fn tidies_what_was_typed() {
        assert!(["b", "a", "t"].iter().all(|f| check_filter(f).is_ok()));
        assert!(["", "x", "at", "f"].iter().all(|f| check_filter(f).is_err()));
        assert_eq!(clip("  night\u{7} drive  ", MAX_QUERY), "night drive");
        assert_eq!(clip(&"a".repeat(500), MAX_QUERY).len(), MAX_QUERY);
    }

    /// Talks to Bandcamp itself, for when it changes: `cargo test --lib bandcamp -- --ignored`.
    #[tokio::test]
    #[ignore = "needs the internet"]
    async fn live_searches_reads_an_album_and_finds_a_stream() {
        let bandcamp = Bandcamp::new("test");
        let request = json!({ "search_text": "ambient", "search_filter": "a", "full_page": false, "fan_id": null });
        let found = bandcamp.read(bandcamp.0.post(format!("{API}/bcsearch_public_api/1/autocomplete_elastic")).json(&request)).await.unwrap();
        let (band, id) = (found["auto"]["results"][0]["band_id"].to_string(), found["auto"]["results"][0]["id"].to_string());
        let album = bandcamp.read(bandcamp.0.get(release_url(&band, "a", &id).unwrap())).await.unwrap();
        let song = album["tracks"].as_array().unwrap().iter().find(|t| t["streaming_url"].is_object()).expect("no streamed song on the album");
        let single = bandcamp.read(bandcamp.0.get(release_url(&song["band_id"].to_string(), "t", &song["track_id"].to_string()).unwrap())).await.unwrap();
        assert!(stream_of(&single).is_some());
        let artist = bandcamp.read(bandcamp.0.post(format!("{API}/mobile/24/band_details")).json(&json!({ "band_id": album["band"]["band_id"] }))).await.unwrap();
        assert!(artist["discography"].as_array().is_some_and(|d| !d.is_empty()));
    }
}
