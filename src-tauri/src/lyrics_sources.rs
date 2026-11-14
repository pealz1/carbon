//! More places to find lyrics, a line translator and "Save lyrics…". The webview may only reach
//! lrclib.net, so these are fetched here. NetEase Cloud Music and Musixmatch are their apps' own
//! endpoints, not public APIs, so they stay off until the listener adds them in Settings → Lyrics;
//! translation goes through Google's unkeyed endpoint. Answers are bounded and checked here, and the
//! webview parses the lyric text (it owns the LRC parser and the matching rules).
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const TIMEOUT: Duration = Duration::from_secs(12);
/// All three turn away clients that don't look like a browser.
const AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const NETEASE: &str = "https://music.163.com/api";
const NETEASE_REFERER: &str = "https://music.163.com/";
const MUSIXMATCH: &str = "https://apic.musixmatch.com/ws/1.1";
/// The desktop app's id (web-desktop-app-v1.0) now answers every query with the same decoy song.
const MUSIXMATCH_APP: &str = "mac-ios-v2.0";
/// What Musixmatch hands out instead of a token when it wants the app updated.
const MUSIXMATCH_NO_TOKEN: &str = "UpgradeOnlyUpgradeOnlyUpgradeOnlyUpgradeOnly";
/// After a captcha or a refusal Musixmatch is left alone this long; asking again only extends it.
const MUSIXMATCH_REST: Duration = Duration::from_secs(10 * 60);
const TRANSLATE: &str = "https://translate.googleapis.com/translate_a/single";
const MAX_QUERY: usize = 200;
const MAX_SONGS: usize = 10;
const MAX_LYRIC_CHARS: usize = 200_000;
const MAX_LINES: usize = 400;
const MAX_LINE_CHARS: usize = 300;
/// One translation request's text; it travels in the URL.
const MAX_BATCH_BYTES: usize = 1_500;
const MAX_TRANSLATE_BYTES: usize = 24_000;
const MAX_SAVE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Default)]
struct Musixmatch {
    token: Option<String>,
    resting_until: Option<Instant>,
}

pub struct LyricsSources {
    http: reqwest::Client,
    /// Held across a lookup, so two songs never ask for a token at once.
    musixmatch: tokio::sync::Mutex<Musixmatch>,
}

impl LyricsSources {
    pub fn new() -> Self {
        let http = reqwest::Client::builder().timeout(TIMEOUT).user_agent(AGENT).build().unwrap_or_default();
        Self { http, musixmatch: Default::default() }
    }
}

fn clip(text: &str, max: usize) -> String {
    text.trim().chars().filter(|c| !c.is_control()).take(max).collect()
}

/// Lyric bodies keep their line breaks; only the length is capped.
fn body(json: &Value, pointer: &str) -> String {
    json.pointer(pointer).and_then(Value::as_str).unwrap_or_default().chars().take(MAX_LYRIC_CHARS).collect()
}

fn flag(json: &Value, pointer: &str) -> bool {
    json.pointer(pointer).is_some_and(|v| v.as_bool().unwrap_or(false) || v.as_u64().is_some_and(|n| n != 0))
}

/// One GET read as JSON. `name` is who was asked ("NetEase", "the translator").
async fn fetch(name: &str, request: reqwest::RequestBuilder) -> Result<Value, String> {
    let res = request.send().await.map_err(|e| {
        eprintln!("[lyrics] {name} failed: {}", e.without_url());
        format!("Can't reach {name}. Check your connection.")
    })?;
    if !res.status().is_success() {
        eprintln!("[lyrics] {name} answered {}", res.status());
        return Err(format!("Couldn't get an answer from {name}. Try again shortly."));
    }
    res.json().await.map_err(|e| {
        eprintln!("[lyrics] {name} sent something unreadable: {}", e.without_url());
        format!("Couldn't read what {name} sent.")
    })
}

fn url(base: &str, query: &[(&str, &str)]) -> Result<reqwest::Url, String> {
    reqwest::Url::parse_with_params(base, query).map_err(|e| e.to_string())
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawArtist {
    name: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawSong {
    id: u64,
    name: String,
    duration: u32,
    artists: Vec<RawArtist>,
}

/// A NetEase search result; the webview picks the one that is this recording.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseSong {
    id: u64,
    name: String,
    artists: Vec<String>,
    duration_ms: u32,
}

fn netease_songs(json: &Value) -> Vec<NeteaseSong> {
    let songs = json.pointer("/result/songs").and_then(Value::as_array).cloned().unwrap_or_default();
    songs
        .into_iter()
        .filter_map(|song| serde_json::from_value::<RawSong>(song).ok())
        .filter(|song| song.id != 0 && !song.name.trim().is_empty())
        .take(MAX_SONGS)
        .map(|song| NeteaseSong {
            id: song.id,
            name: clip(&song.name, MAX_QUERY),
            artists: song.artists.iter().map(|a| clip(&a.name, MAX_QUERY)).filter(|a| !a.is_empty()).collect(),
            duration_ms: song.duration,
        })
        .collect()
}

/// NetEase's lyrics as it stores them: LRC, its Chinese translation (LRC) and its word-timed "yrc".
#[derive(Serialize, Debug, PartialEq)]
pub struct NeteaseLyrics {
    lrc: String,
    translation: String,
    words: String,
    instrumental: bool,
}

fn netease_lyrics(json: &Value) -> NeteaseLyrics {
    NeteaseLyrics {
        lrc: body(json, "/lrc/lyric"),
        translation: body(json, "/tlyric/lyric"),
        words: body(json, "/yrc/lyric"),
        instrumental: flag(json, "/nolyric"),
    }
}

async fn netease_search(sources: &LyricsSources, query: &str) -> Result<Vec<NeteaseSong>, String> {
    let query = clip(query, MAX_QUERY);
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let limit = MAX_SONGS.to_string();
    let address = url(&format!("{NETEASE}/search/get"), &[("s", query.as_str()), ("type", "1"), ("limit", limit.as_str()), ("offset", "0")])?;
    let json = fetch("NetEase", sources.http.get(address).header(reqwest::header::REFERER, NETEASE_REFERER)).await?;
    Ok(netease_songs(&json))
}

async fn netease_get(sources: &LyricsSources, id: u64) -> Result<NeteaseLyrics, String> {
    let id = id.to_string();
    // Its "v1" lyric call refuses any other combination of these switches.
    let switches = ["cp", "lv", "tv", "rv", "kv", "yv", "ytv", "yrv"].map(|key| (key, if key == "cp" { "false" } else { "0" }));
    let address = url(&format!("{NETEASE}/song/lyric/v1"), &[&[("id", id.as_str())][..], &switches[..]].concat())?;
    let json = fetch("NetEase", sources.http.get(address).header(reqwest::header::REFERER, NETEASE_REFERER)).await?;
    Ok(netease_lyrics(&json))
}

/// What Musixmatch matched and the lyrics it has for it. The webview checks the match is the song
/// it asked about before showing anything.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MusixmatchLyrics {
    track_name: String,
    artist_name: String,
    /// 0 when Musixmatch doesn't say.
    duration_s: u32,
    instrumental: bool,
    /// Word-timed lines as Musixmatch's own JSON; "" when it has none.
    richsync: String,
    /// Line-timed LRC.
    subtitle: String,
    plain: String,
}

#[derive(Debug, PartialEq)]
enum Answer {
    Found(Box<MusixmatchLyrics>),
    Missing,
    /// The token ran out; the next song fetches a new one.
    Renew,
    /// A captcha or anything else that means "not now".
    Refused(String),
}

/// (status, hint) of a Musixmatch message; every call in a macro answer carries its own.
fn musixmatch_status(message: &Value) -> (u64, &str) {
    let header = &message["header"];
    (header["status_code"].as_u64().unwrap_or(0), header["hint"].as_str().unwrap_or_default())
}

fn musixmatch_answer(json: &Value) -> Answer {
    match musixmatch_status(&json["message"]) {
        (200, _) => {}
        (401, "renew") => return Answer::Renew,
        (status, hint) => return Answer::Refused(format!("{status} {hint}")),
    }
    let call = |name: &str, path: &str| format!("/message/body/macro_calls/{name}/message{path}");
    let Some(track) = json.pointer(&call("matcher.track.get", "/body/track")).filter(|t| t.is_object()) else { return Answer::Missing };
    let lyrics = call("track.lyrics.get", "/body/lyrics");
    let restricted = flag(json, &format!("{lyrics}/restricted"));
    Answer::Found(Box::new(MusixmatchLyrics {
        track_name: clip(track["track_name"].as_str().unwrap_or_default(), MAX_QUERY),
        artist_name: clip(track["artist_name"].as_str().unwrap_or_default(), MAX_QUERY),
        duration_s: track["track_length"].as_u64().unwrap_or(0).min(u32::MAX.into()) as u32,
        instrumental: flag(track, "/instrumental") || flag(json, &format!("{lyrics}/instrumental")),
        richsync: body(json, &call("track.richsync.get", "/body/richsync/richsync_body")),
        subtitle: body(json, &call("track.subtitles.get", "/body/subtitle_list/0/subtitle/subtitle_body")),
        // A restricted body is only the first lines plus a notice.
        plain: if restricted { String::new() } else { body(json, &format!("{lyrics}/lyrics_body")) },
    }))
}

fn musixmatch_token(json: &Value) -> Result<String, String> {
    let (status, hint) = musixmatch_status(&json["message"]);
    let token = json.pointer("/message/body/user_token").and_then(Value::as_str).unwrap_or_default();
    if status != 200 || token.is_empty() || token == MUSIXMATCH_NO_TOKEN {
        return Err(format!("no token ({status} {hint})"));
    }
    Ok(token.to_string())
}

/// One attempt, never repeated here. Err means Musixmatch refused and should be left alone a while;
/// a network failure is just "nothing this time".
async fn musixmatch_lookup(http: &reqwest::Client, state: &mut Musixmatch, song: &[(&str, &str)]) -> Result<Option<MusixmatchLyrics>, String> {
    if state.token.is_none() {
        let Ok(json) = fetch("Musixmatch", http.get(url(&format!("{MUSIXMATCH}/token.get"), &[("app_id", MUSIXMATCH_APP)])?)).await else { return Ok(None) };
        state.token = Some(musixmatch_token(&json)?);
    }
    let token = state.token.clone().unwrap_or_default();
    let fixed = [("format", "json"), ("namespace", "lyrics_richsynched"), ("optional_calls", "track.richsync"), ("subtitle_format", "lrc"), ("app_id", MUSIXMATCH_APP), ("usertoken", token.as_str())];
    let address = url(&format!("{MUSIXMATCH}/macro.subtitles.get"), &[&fixed[..], song].concat())?;
    let Ok(json) = fetch("Musixmatch", http.get(address)).await else { return Ok(None) };
    match musixmatch_answer(&json) {
        Answer::Found(lyrics) => Ok(Some(*lyrics)),
        Answer::Missing => Ok(None),
        Answer::Renew => {
            state.token = None;
            Ok(None)
        }
        Answer::Refused(why) => Err(why),
    }
}

/// Musixmatch's match for a song, or None when it has nothing or isn't answering (it rate-limits
/// and shows captchas freely); after a refusal it isn't asked again for a while.
async fn musixmatch(sources: &LyricsSources, title: &str, artist: &str, album: &str, duration_s: u32) -> Option<MusixmatchLyrics> {
    let (title, artist, album, duration) = (clip(title, MAX_QUERY), clip(artist, MAX_QUERY), clip(album, MAX_QUERY), duration_s.to_string());
    let mut state = sources.musixmatch.lock().await;
    if title.is_empty() || state.resting_until.is_some_and(|until| Instant::now() < until) {
        return None;
    }
    let song = [("q_track", title.as_str()), ("q_artist", artist.as_str()), ("q_album", album.as_str()), ("q_duration", duration.as_str())];
    musixmatch_lookup(&sources.http, &mut state, &song).await.unwrap_or_else(|why| {
        eprintln!("[lyrics] Musixmatch refused ({why}); leaving it alone for {} minutes", MUSIXMATCH_REST.as_secs() / 60);
        state.resting_until = Some(Instant::now() + MUSIXMATCH_REST);
        None
    })
}

/// A language code Google's translator takes: "en", "pt", "zh-CN", "fil".
pub fn is_language(code: &str) -> bool {
    let (language, region) = code.split_once('-').unwrap_or((code, "aa"));
    (2..=3).contains(&language.len()) && language.bytes().all(|b| b.is_ascii_lowercase()) && (2..=4).contains(&region.len()) && region.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// Consecutive lines grouped so each group's text fits one request.
fn batches(lines: &[String]) -> Vec<&[String]> {
    let mut groups = Vec::new();
    let (mut start, mut bytes) = (0, 0);
    for (i, line) in lines.iter().enumerate() {
        if i > start && bytes + line.len() + 1 > MAX_BATCH_BYTES {
            groups.push(&lines[start..i]);
            (start, bytes) = (i, 0);
        }
        bytes += line.len() + 1;
    }
    if start < lines.len() {
        groups.push(&lines[start..]);
    }
    groups
}

/// The translator answers in sentence pieces, each keeping its line break; joined and split again
/// they must give one line per line sent, or the translation can't be trusted to line up.
fn translated(json: &Value, expected: usize) -> Option<Vec<String>> {
    let text: String = json.get(0)?.as_array()?.iter().filter_map(|piece| piece.get(0)?.as_str()).collect();
    let lines: Vec<String> = text.split('\n').map(|line| clip(line, MAX_LINE_CHARS * 2)).collect();
    (lines.len() == expected).then_some(lines)
}

/// Each line in `target`, in the same order. The lines leave this PC for Google's translator.
async fn translate(sources: &LyricsSources, lines: &[String], target: &str) -> Result<Vec<String>, String> {
    if !is_language(target) {
        return Err("Carbon can't translate into that language.".into());
    }
    let lines: Vec<String> = lines.iter().map(|line| clip(line, MAX_LINE_CHARS)).collect();
    if lines.len() > MAX_LINES || lines.iter().map(String::len).sum::<usize>() > MAX_TRANSLATE_BYTES || lines.iter().any(String::is_empty) {
        return Err("These lyrics can't be translated: too long, or with empty lines.".into());
    }
    let mut out = Vec::with_capacity(lines.len());
    for batch in batches(&lines) {
        let text = batch.join("\n");
        let address = url(TRANSLATE, &[("client", "gtx"), ("sl", "auto"), ("tl", target), ("dt", "t"), ("q", text.as_str())])?;
        let json = fetch("the translator", sources.http.get(address)).await?;
        out.extend(translated(&json, batch.len()).ok_or("The translation didn't line up with the lyrics.")?);
    }
    Ok(out)
}

/// Songs on NetEase Cloud Music matching "title artist"; the webview picks the one that's playing.
#[tauri::command]
pub async fn lyrics_netease_search(sources: State<'_, LyricsSources>, query: String) -> Result<Vec<NeteaseSong>, String> {
    netease_search(&sources, &query).await
}

#[tauri::command]
pub async fn lyrics_netease_get(sources: State<'_, LyricsSources>, id: u64) -> Result<NeteaseLyrics, String> {
    netease_get(&sources, id).await
}

/// Never an error: when Musixmatch has nothing or refuses, the lyrics view moves on to the next source.
#[tauri::command]
pub async fn lyrics_musixmatch(sources: State<'_, LyricsSources>, title: String, artist: String, album: String, duration_s: u32) -> Result<Option<MusixmatchLyrics>, String> {
    Ok(musixmatch(&sources, &title, &artist, &album, duration_s).await)
}

#[tauri::command]
pub async fn lyrics_translate(sources: State<'_, LyricsSources>, lines: Vec<String>, target: String) -> Result<Vec<String>, String> {
    translate(&sources, &lines, &target).await
}

/// Opens the save dialog and writes the lyrics: .lrc when timed, .txt otherwise. Returns the
/// chosen file's name, or None if cancelled.
#[tauri::command]
pub async fn lyrics_save(app: AppHandle, name: String, synced: bool, contents: String) -> Result<Option<String>, String> {
    if contents.len() > MAX_SAVE_BYTES {
        return Err("Those lyrics are too large to save.".into());
    }
    let (extension, label) = if synced { ("lrc", "Synced lyrics") } else { ("txt", "Text") };
    let picked = app
        .dialog()
        .file()
        .set_title("Save lyrics")
        .set_file_name(format!("{}.{extension}", crate::library_tools::safe_file_name(&name)))
        .add_filter(label, &[extension])
        .blocking_save_file();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|_| "That location can't be written.".to_string())?;
    fs::write(&path, contents).map_err(|e| format!("Couldn't save the file: {e}"))?;
    Ok(path.file_name().map(|n| n.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // Trimmed from real answers; the lyric lines are invented placeholders.

    #[test]
    fn reads_netease_search_results_and_skips_broken_ones() {
        let answer = json!({ "result": { "songs": [
            { "album": { "name": "OK Computer" }, "fee": 1, "duration": 229120, "artists": [{ "id": 1, "name": "Radiohead" }], "name": "No Surprises", "alias": [], "id": 22497479, "status": 0 },
            { "name": "   ", "id": 5, "duration": 1 },
            { "name": "No id", "duration": 1 },
            { "name": null, "id": 7 },
            { "name": "Live", "id": 2163629875u64, "duration": 254931, "artists": [{ "name": "Radiohead" }, { "name": " " }] }
        ], "hasMore": true, "songCount": 300 }, "code": 200 });
        let songs = netease_songs(&answer);
        assert_eq!(songs.len(), 2);
        assert_eq!(songs[0], NeteaseSong { id: 22497479, name: "No Surprises".into(), artists: vec!["Radiohead".into()], duration_ms: 229120 });
        assert_eq!((songs[1].id, songs[1].artists.len()), (2163629875, 1));
        assert!(netease_songs(&json!({ "code": 200, "result": {} })).is_empty());
        assert!(netease_songs(&json!("nonsense")).is_empty());
    }

    #[test]
    fn reads_netease_lyrics_in_every_form_it_keeps() {
        let answer = json!({
            "sgc": false, "sfy": false, "qfy": false,
            "lrc": { "version": 23, "lyric": "{\"t\":0,\"c\":[{\"tx\":\"作词: \"},{\"tx\":\"Someone\"}]}\n[00:04.630]first placeholder line\n[00:09.520]second placeholder line\n" },
            "klyric": { "version": 0, "lyric": "" },
            "tlyric": { "version": 17, "lyric": "[by:someone]\n[00:04.630]第一行\n[00:09.520]第二行\n" },
            "romalrc": { "version": 0, "lyric": "" },
            "yrc": { "version": 24, "lyric": "[4630,4890](4630,270,0)first (4900,270,0)placeholder (5170,280,0)line\n" },
            "code": 200
        });
        let lyrics = netease_lyrics(&answer);
        assert!(lyrics.lrc.contains("[00:09.520]second placeholder line"));
        assert!(lyrics.translation.starts_with("[by:someone]\n[00:04.630]"));
        assert!(lyrics.words.starts_with("[4630,4890](4630,270,0)first "));
        assert!(!lyrics.instrumental);
        let none = netease_lyrics(&json!({ "nolyric": true, "code": 200 }));
        assert_eq!(none, NeteaseLyrics { lrc: String::new(), translation: String::new(), words: String::new(), instrumental: true });
    }

    fn macro_answer(track: Value, lyrics: Value) -> Value {
        json!({ "message": { "header": { "status_code": 200, "execute_time": 0.78, "pid": 27, "surrogate_key_list": [] }, "body": { "macro_calls": {
            "track.lyrics.get": { "message": { "header": { "status_code": 200 }, "body": { "lyrics": lyrics } } },
            "track.snippet.get": { "message": { "header": { "status_code": 200 }, "body": { "snippet": { "snippet_body": "a placeholder" } } } },
            "track.subtitles.get": { "message": { "header": { "status_code": 200, "available": 2, "instrumental": 0 }, "body": { "subtitle_list": [{ "subtitle": { "subtitle_id": 1, "restricted": 0, "subtitle_length": 229, "subtitle_language": "en", "subtitle_body": "[00:25.48] first placeholder line\n[00:34.30] second placeholder line" } }] } } },
            "userblob.get": { "message": { "header": { "status_code": 404 } } },
            "matcher.track.get": { "message": { "header": { "status_code": 200, "confidence": 1000, "mode": "search", "cached": 0 }, "body": { "track": track } } },
            "track.richsync.get": { "message": { "header": { "status_code": 200, "available": 2 }, "body": { "richsync": { "richsync_id": 2, "restricted": 0, "richsync_length": 229, "richsync_body": "[{\"ts\":25.4899,\"te\":34.3,\"l\":[{\"c\":\"first\",\"o\":0},{\"c\":\" \",\"o\":0.103},{\"c\":\"line\",\"o\":0.2039}],\"x\":\"first line\"}]" } } } }
        } } } })
    }

    #[test]
    fn reads_a_musixmatch_match_with_every_kind_of_lyrics() {
        let track = json!({ "track_id": 1, "track_name": "No Surprises", "artist_name": "Radiohead", "track_length": 229, "instrumental": 0, "has_lyrics": 1, "has_subtitles": 1, "has_richsync": 1 });
        let lyrics = json!({ "lyrics_id": 3, "restricted": 0, "instrumental": 0, "lyrics_body": "first placeholder line\nsecond placeholder line", "lyrics_language": "en" });
        let Answer::Found(found) = musixmatch_answer(&macro_answer(track.clone(), lyrics)) else { panic!("expected a match") };
        assert_eq!((found.track_name.as_str(), found.artist_name.as_str(), found.duration_s, found.instrumental), ("No Surprises", "Radiohead", 229, false));
        assert!(found.richsync.starts_with("[{\"ts\":25.4899"));
        assert!(found.subtitle.starts_with("[00:25.48] first"));
        assert_eq!(found.plain, "first placeholder line\nsecond placeholder line");
        let restricted = json!({ "restricted": 1, "instrumental": 1, "lyrics_body": "first placeholder line\n...\n******* This Lyrics is NOT for Commercial use *******" });
        let Answer::Found(partial) = musixmatch_answer(&macro_answer(track, restricted)) else { panic!("expected a match") };
        assert_eq!((partial.plain.as_str(), partial.instrumental), ("", true));
    }

    #[test]
    fn tells_a_miss_from_an_expired_token_from_a_refusal() {
        let header = |status: u64, hint: &str| json!({ "message": { "header": { "status_code": status, "execute_time": 0.02, "hint": hint }, "body": [] } });
        assert_eq!(musixmatch_answer(&header(401, "renew")), Answer::Renew);
        assert_eq!(musixmatch_answer(&header(401, "captcha")), Answer::Refused("401 captcha".into()));
        assert_eq!(musixmatch_answer(&header(402, "")), Answer::Refused("402 ".into()));
        assert_eq!(musixmatch_answer(&json!("<html>")), Answer::Refused("0 ".into()));
        let unmatched = json!({ "message": { "header": { "status_code": 200 }, "body": { "macro_calls": { "matcher.track.get": { "message": { "header": { "status_code": 404 }, "body": "" } } } } } });
        assert_eq!(musixmatch_answer(&unmatched), Answer::Missing);
    }

    #[test]
    fn takes_a_real_token_and_refuses_the_stand_ins() {
        let answer = |status: u64, body: Value| json!({ "message": { "header": { "status_code": status, "hint": "captcha" }, "body": body } });
        assert_eq!(musixmatch_token(&answer(200, json!({ "user_token": "2511abc", "app_config": {} }))).as_deref(), Ok("2511abc"));
        assert!(musixmatch_token(&answer(401, json!([]))).unwrap_err().contains("captcha"));
        assert!(musixmatch_token(&answer(200, json!({ "user_token": MUSIXMATCH_NO_TOKEN }))).is_err());
        assert!(musixmatch_token(&answer(200, json!({ "user_token": "" }))).is_err());
    }

    /// Talks to the real services: `cargo test live_ -- --ignored --nocapture`. NetEase must answer;
    /// Musixmatch and the translator refuse often enough that their answer is only printed.
    #[tokio::test]
    #[ignore]
    async fn live_sources_and_translation() {
        let sources = LyricsSources::new();
        let songs = netease_search(&sources, "No Surprises Radiohead").await.unwrap();
        let song = songs.iter().find(|s| s.name == "No Surprises").expect("NetEase lists the song");
        assert!(netease_get(&sources, song.id).await.unwrap().lrc.contains("[0"));
        let found = musixmatch(&sources, "No Surprises", "Radiohead", "OK Computer", 229).await;
        eprintln!("Musixmatch: {:?}", found.map(|f| (f.track_name, f.artist_name, f.duration_s, f.richsync.len(), f.subtitle.len(), f.plain.len())));
        eprintln!("Translator: {:?}", translate(&sources, &["la pluie tombe sur la ville".into(), "je marche seul".into()], "en").await);
    }

    #[test]
    fn recognises_language_codes() {
        for ok in ["en", "pt", "fil", "zh-CN", "zh-TW", "es-419"] {
            assert!(is_language(ok), "{ok}");
        }
        for bad in ["", "e", "english", "EN", "en-", "en&q=x", "zh_CN", "en-toolong"] {
            assert!(!is_language(bad), "{bad}");
        }
    }

    #[test]
    fn groups_lines_into_requests_that_fit() {
        let lines: Vec<String> = (0..10).map(|_| "x".repeat(400)).collect();
        let groups = batches(&lines);
        assert_eq!(groups.iter().map(|g| g.len()).collect::<Vec<_>>(), [3, 3, 3, 1]);
        assert!(groups.iter().all(|g| g.iter().map(|l| l.len() + 1).sum::<usize>() <= MAX_BATCH_BYTES));
        assert_eq!(batches(&["x".repeat(MAX_BATCH_BYTES * 2)]).len(), 1); // an over-long line still goes, alone
        assert!(batches(&[]).is_empty());
    }

    #[test]
    fn lines_up_a_translation_or_refuses_it() {
        // The shape of translate_a/single with dt=t: [[[translated, original, …], …], null, "fr", …].
        let answer = json!([[["the first line\n", "la première ligne\n", null, null, 10], ["the second. ", "la deuxième. ", null, null, 3], ["Still the second\n", "Toujours\n", null, null, 3], ["the third", "la troisième", null, null, 10]], null, "fr"]);
        assert_eq!(translated(&answer, 3).unwrap(), ["the first line", "the second. Still the second", "the third"]);
        assert_eq!(translated(&answer, 4), None);
        assert_eq!(translated(&json!({ "error": 429 }), 1), None);
    }
}
