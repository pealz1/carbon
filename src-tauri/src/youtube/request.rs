//! InnerTube requests Carbon may make, built and validated here so the webview can only ask for
//! these operations with well-formed ids. Request shapes follow sigma67/ytmusicapi (MIT).
use serde::Deserialize;
use serde_json::{Value, json};

const MAX_QUERY: usize = 256;
const MAX_TITLE: usize = 150;
const MAX_DESCRIPTION: usize = 5000;
const MAX_PARAMS: usize = 512;
const MAX_TOKEN: usize = 4096;
const MAX_ID: usize = 128;
const MAX_VIDEOS: usize = 200;
/// Pages Carbon opens: home and library (FEmusic_), playlists (VL), albums (MPRE), artists and
/// channels (UC), lyrics (MPLY) and discographies (MPAD).
const BROWSE_PREFIXES: [&str; 6] = ["FEmusic_", "VL", "MPRE", "UC", "MPLY", "MPAD"];

/// One InnerTube call: `POST youtubei/v1/<endpoint>` with `body` (the client context is added later).
#[derive(Debug, PartialEq)]
pub struct Call {
    pub endpoint: &'static str,
    pub body: Value,
    /// Sent as YouTube Music's phone app, signed out: the only client that gets line-timed lyrics.
    pub mobile: bool,
}

const fn call(endpoint: &'static str, body: Value) -> Call {
    Call { endpoint, body, mobile: false }
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SearchFilter {
    Songs,
    Videos,
    Albums,
    Artists,
    Playlists,
}

impl SearchFilter {
    /// The `params` the web client sends for each search tab.
    fn params(self) -> &'static str {
        match self {
            Self::Songs => "EgWKAQIIAWoMEA4QChADEAQQCRAF",
            Self::Videos => "EgWKAQIQAWoMEA4QChADEAQQCRAF",
            Self::Albums => "EgWKAQIYAWoMEA4QChADEAQQCRAF",
            Self::Artists => "EgWKAQIgAWoMEA4QChADEAQQCRAF",
            Self::Playlists => "EgeKAQQoAEABagwQDhAKEAMQBBAJEAU=",
        }
    }
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub video_id: String,
    pub set_video_id: String,
}

fn charset_ok(s: &str, extra: &[u8]) -> bool {
    s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || extra.contains(&b))
}

pub fn video_id(id: &str) -> Result<&str, String> {
    if id.len() == 11 && charset_ok(id, b"") {
        Ok(id)
    } else {
        Err("That isn't a YouTube video.".into())
    }
}

/// Playlist ids as the edit endpoints want them: without the "VL" browse prefix.
pub fn playlist_id(id: &str) -> Result<&str, String> {
    let id = id.strip_prefix("VL").unwrap_or(id);
    if (2..=MAX_ID).contains(&id.len()) && charset_ok(id, b"") {
        Ok(id)
    } else {
        Err("That isn't a YouTube Music playlist.".into())
    }
}

pub fn browse_id(id: &str) -> Result<&str, String> {
    let known = BROWSE_PREFIXES.iter().any(|p| id.len() > p.len() && id.starts_with(p));
    if known && id.len() <= MAX_ID && charset_ok(id, b"") {
        Ok(id)
    } else {
        Err("Carbon can't open that YouTube Music page.".into())
    }
}

/// Opaque base64-ish strings from earlier responses (params, continuation tokens).
fn opaque(s: &str, max: usize) -> Result<&str, String> {
    if !s.is_empty() && s.len() <= max && charset_ok(s, b"%=+/.") {
        Ok(s)
    } else {
        Err("YouTube Music sent something Carbon can't use.".into())
    }
}

/// Single-line, required text (search queries, playlist names).
fn text(s: &str, max: usize, what: &str) -> Result<String, String> {
    let s = s.trim();
    if s.is_empty() || s.chars().count() > max || s.chars().any(char::is_control) {
        return Err(format!("That {what} isn't valid (1 to {max} characters, one line)."));
    }
    Ok(s.to_string())
}

/// Optional, multi-line text (playlist descriptions).
fn description(s: &str) -> Result<String, String> {
    let s = s.trim();
    if s.chars().count() > MAX_DESCRIPTION || s.chars().any(|c| c.is_control() && c != '\n') {
        return Err(format!("Descriptions can be up to {MAX_DESCRIPTION} characters."));
    }
    Ok(s.to_string())
}

fn videos(ids: &[String]) -> Result<Vec<&str>, String> {
    if ids.len() > MAX_VIDEOS {
        return Err(format!("Add up to {MAX_VIDEOS} songs at a time."));
    }
    ids.iter().map(|id| video_id(id)).collect()
}

pub fn search(query: &str, filter: Option<SearchFilter>) -> Result<Call, String> {
    let query = text(query, MAX_QUERY, "search")?;
    let mut body = json!({ "query": query });
    if let Some(filter) = filter {
        body["params"] = filter.params().into();
    }
    Ok(call("search", body))
}

pub fn browse(id: &str, params: Option<&str>) -> Result<Call, String> {
    let mut body = json!({ "browseId": browse_id(id)? });
    if let Some(params) = params {
        body["params"] = opaque(params, MAX_PARAMS)?.into();
    }
    Ok(call("browse", body))
}

/// A song's lyrics page as the phone app sees it: each line with when it starts and ends.
pub fn timed_lyrics(id: &str) -> Result<Call, String> {
    if !id.starts_with("MPLY") {
        return Err("Carbon can't open that YouTube Music page.".into());
    }
    Ok(Call { mobile: true, ..call("browse", json!({ "browseId": browse_id(id)? })) })
}

/// The next page of a browse result (long playlists, library lists).
pub fn browse_more(token: &str) -> Result<Call, String> {
    Ok(call("browse", json!({ "continuation": opaque(token, MAX_TOKEN)? })))
}

/// Up next / radio for a song or playlist.
pub fn next(video: Option<&str>, playlist: Option<&str>, params: Option<&str>) -> Result<Call, String> {
    if video.is_none() && playlist.is_none() {
        return Err("Pick a song or playlist first.".into());
    }
    let mut body = json!({ "isAudioOnly": true, "enablePersistentPlaylistPanel": true, "tunerSettingValue": "AUTOMIX_SETTING_NORMAL" });
    if let Some(v) = video {
        body["videoId"] = video_id(v)?.into();
    }
    if let Some(p) = playlist {
        body["playlistId"] = playlist_id(p)?.into();
    }
    if let Some(p) = params {
        body["params"] = opaque(p, MAX_PARAMS)?.into();
    }
    Ok(call("next", body))
}

pub fn rate(video: &str, like: bool) -> Result<Call, String> {
    let body = json!({ "target": { "videoId": video_id(video)? } });
    Ok(call(if like { "like/like" } else { "like/removelike" }, body))
}

pub fn create_playlist(title: &str, description: &str, video_ids: &[String]) -> Result<Call, String> {
    let mut body = json!({
        "title": text(title, MAX_TITLE, "name")?,
        "description": self::description(description)?,
        "privacyStatus": "PRIVATE",
    });
    let ids = videos(video_ids)?;
    if !ids.is_empty() {
        body["videoIds"] = ids.into();
    }
    Ok(call("playlist/create", body))
}

fn edit(playlist: &str, actions: Vec<Value>) -> Result<Call, String> {
    Ok(call("browse/edit_playlist", json!({ "playlistId": playlist_id(playlist)?, "actions": actions })))
}

pub fn rename_playlist(playlist: &str, title: &str) -> Result<Call, String> {
    edit(playlist, vec![json!({ "action": "ACTION_SET_PLAYLIST_NAME", "playlistName": text(title, MAX_TITLE, "name")? })])
}

pub fn add_to_playlist(playlist: &str, video_ids: &[String]) -> Result<Call, String> {
    let ids = videos(video_ids)?;
    if ids.is_empty() {
        return Err("Pick a song to add.".into());
    }
    let actions = ids.into_iter().map(|id| json!({ "action": "ACTION_ADD_VIDEO", "addedVideoId": id, "dedupeOption": "DEDUPE_OPTION_SKIP" }));
    edit(playlist, actions.collect())
}

pub fn remove_from_playlist(playlist: &str, entries: &[PlaylistEntry]) -> Result<Call, String> {
    if entries.is_empty() || entries.len() > MAX_VIDEOS {
        return Err(format!("Remove between 1 and {MAX_VIDEOS} songs at a time."));
    }
    let actions = entries
        .iter()
        .map(|e| {
            let set = opaque(&e.set_video_id, MAX_ID)?;
            Ok(json!({ "action": "ACTION_REMOVE_VIDEO", "removedVideoId": video_id(&e.video_id)?, "setVideoId": set }))
        })
        .collect::<Result<Vec<_>, String>>()?;
    edit(playlist, actions)
}

pub fn delete_playlist(playlist: &str) -> Result<Call, String> {
    Ok(call("playlist/delete", json!({ "playlistId": playlist_id(playlist)? })))
}

pub fn account() -> Call {
    call("account/account_menu", json!({}))
}

/// Only used to explain why a video won't play; Carbon reads just `playabilityStatus`.
pub fn playability(video: &str) -> Result<Call, String> {
    Ok(call("player", json!({ "videoId": video_id(video)? })))
}

/// "1.YYYYMMDD.01.00" for the given day (UTC), the version format the web client sends.
pub fn client_version(unix_secs: u64) -> String {
    let (y, m, d) = civil_from_days((unix_secs / 86_400) as i64);
    format!("1.{y:04}{m:02}{d:02}.01.00")
}

/// Days since 1970-01-01 to a calendar date (Howard Hinnant's algorithm).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_ids() {
        assert!(video_id("7374CZQoS2Y").is_ok());
        assert!(video_id("7374CZQoS2").is_err());
        assert!(video_id("7374CZQoS2Y&x").is_err());
        assert_eq!(playlist_id("VLPLUwsfagaCki8ibIU--3oKGVXqhKhl3_SW"), Ok("PLUwsfagaCki8ibIU--3oKGVXqhKhl3_SW"));
        assert!(playlist_id("PL/../x").is_err());
        for ok in ["FEmusic_home", "VLLM", "MPREb_yXhSI4FCUo6", "UCr_iyUANcn9OX_yy9piYoLw", "MPLYt_b9Yfli6Cg79-10"] {
            assert!(browse_id(ok).is_ok(), "{ok}");
        }
        for bad in ["", "VL", "SPaccount_overview", "FEmusic_home?x=1", "javascript:1"] {
            assert!(browse_id(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn builds_search_and_browse() {
        assert_eq!(search("  radiohead ", None).unwrap(), call("search", json!({ "query": "radiohead" })));
        let songs = search("x", Some(SearchFilter::Songs)).unwrap();
        assert_eq!(songs.body["params"], "EgWKAQIIAWoMEA4QChADEAQQCRAF");
        assert!(search("   ", None).is_err());
        assert!(search(&"a".repeat(MAX_QUERY + 1), None).is_err());
        assert!(search("line\nbreak", None).is_err());
        assert_eq!(browse("UCabc", Some("ggMIegYIARoCAQI%3D")).unwrap().body["params"], "ggMIegYIARoCAQI%3D");
        assert!(browse("UCabc", Some("<script>")).is_err());
        assert!(browse_more(&"t".repeat(MAX_TOKEN + 1)).is_err());
    }

    #[test]
    fn timed_lyrics_only_opens_lyrics_pages_as_the_phone_app() {
        let lyrics = timed_lyrics("MPLYt_4U7yfKKFZLv-1").unwrap();
        assert!(lyrics.mobile);
        assert_eq!((lyrics.endpoint, &lyrics.body["browseId"]), ("browse", &json!("MPLYt_4U7yfKKFZLv-1")));
        assert!(timed_lyrics("FEmusic_home").is_err());
        assert!(timed_lyrics("MPLY").is_err());
        assert!(!browse("MPLYt_4U7yfKKFZLv-1", None).unwrap().mobile);
    }

    #[test]
    fn builds_next_and_rate() {
        assert!(next(None, None, None).is_err());
        let radio = next(Some("7374CZQoS2Y"), Some("RDAMVM7374CZQoS2Y"), None).unwrap();
        assert_eq!(radio.body["videoId"], "7374CZQoS2Y");
        assert_eq!(radio.body["playlistId"], "RDAMVM7374CZQoS2Y");
        assert_eq!(rate("7374CZQoS2Y", true).unwrap().endpoint, "like/like");
        assert_eq!(rate("7374CZQoS2Y", false).unwrap().endpoint, "like/removelike");
        assert!(rate("nope", true).is_err());
    }

    #[test]
    fn builds_playlist_edits() {
        let created = create_playlist("Mix", "", &["7374CZQoS2Y".into()]).unwrap();
        assert_eq!(created.body["privacyStatus"], "PRIVATE");
        assert_eq!(created.body["videoIds"], json!(["7374CZQoS2Y"]));
        assert!(create_playlist("", "", &[]).is_err());
        assert!(create_playlist("Mix", "", &vec!["7374CZQoS2Y".to_string(); MAX_VIDEOS + 1]).is_err());
        let renamed = rename_playlist("VLPLabc", "New").unwrap();
        assert_eq!(renamed.body["playlistId"], "PLabc");
        assert_eq!(renamed.body["actions"][0]["playlistName"], "New");
        assert!(add_to_playlist("PLabc", &[]).is_err());
        let entry = PlaylistEntry { video_id: "7374CZQoS2Y".into(), set_video_id: "56B44F6D10557CC6".into() };
        let removed = remove_from_playlist("PLabc", &[entry]).unwrap();
        assert_eq!(removed.body["actions"][0]["setVideoId"], "56B44F6D10557CC6");
        let bad = PlaylistEntry { video_id: "7374CZQoS2Y".into(), set_video_id: "a b".into() };
        assert!(remove_from_playlist("PLabc", &[bad]).is_err());
        assert_eq!(delete_playlist("VLPLabc").unwrap().body, json!({ "playlistId": "PLabc" }));
    }

    #[test]
    fn formats_the_client_version() {
        assert_eq!(client_version(0), "1.19700101.01.00");
        assert_eq!(client_version(1_709_164_800), "1.20240229.01.00");
        assert_eq!(client_version(1_794_355_200 + 86_399), "1.20261111.01.00");
    }
}
