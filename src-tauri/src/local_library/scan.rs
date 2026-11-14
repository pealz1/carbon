//! Walks library folders for audio files and reads their tags and embedded artwork with lofty.
//! Files whose size and mtime haven't changed since the last scan are reused as-is. A file with
//! a CUE sheet beside it is listed as the sheet's tracks instead (cue.rs).
use super::{LocalTrack, cue};
use crate::engine::contain::contain;
use crate::engine::loudness;
use lofty::picture::{MimeType, PictureType};
use lofty::prelude::*;
use lofty::tag::Tag;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Formats the engine can decode. Opus isn't here: Symphonia has no pure-Rust Opus decoder.
pub const EXTENSIONS: [&str; 9] = ["mp3", "flac", "m4a", "mp4", "aac", "ogg", "oga", "wav", "wave"];
pub const MAX_FILES: usize = 100_000;
const SHEET_EXTENSION: &str = "cue";
const MAX_DEPTH: usize = 32;
const MAX_ARTWORK_BYTES: usize = 16 * 1024 * 1024;
const UNKNOWN_ARTIST: &str = "Unknown artist";

pub fn track_id(path: &Path) -> String {
    format!("{:x}", md5::compute(path.to_string_lossy().as_bytes()))
}

fn has_extension(path: &Path, wanted: &[&str]) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| wanted.contains(&e.to_ascii_lowercase().as_str()))
}

fn is_audio(path: &Path) -> bool {
    has_extension(path, &EXTENSIONS)
}

/// What a walk of the library folders turned up, each list in path order.
#[derive(Default, Debug, PartialEq)]
pub struct Found {
    pub audio: Vec<PathBuf>,
    pub sheets: Vec<PathBuf>,
}

/// Every audio file and CUE sheet under `roots`, without following links or entering hidden folders.
pub fn find(roots: &[PathBuf]) -> Found {
    let mut found = Found::default();
    let mut stack: Vec<(PathBuf, usize)> = roots.iter().map(|r| (r.clone(), 0)).collect();
    while let Some((dir, depth)) = stack.pop().filter(|_| found.audio.len() < MAX_FILES) {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else { continue };
            let path = entry.path();
            let hidden = entry.file_name().to_string_lossy().starts_with('.');
            if kind.is_dir() && !hidden && depth < MAX_DEPTH {
                stack.push((path, depth + 1));
            } else if kind.is_file() && is_audio(&path) && found.audio.len() < MAX_FILES {
                found.audio.push(path);
            } else if kind.is_file() && has_extension(&path, &[SHEET_EXTENSION]) && found.sheets.len() < MAX_FILES {
                found.sheets.push(path);
            }
        }
    }
    found.audio.sort();
    found.sheets.sort();
    found
}

fn stamp(path: &Path) -> Option<(u64, u64)> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
    Some((meta.len(), modified))
}

/// `previous` holds the last scan's whole files by path.
/// shortcut: a file split by a CUE sheet is never in it, so it is read again on every scan;
/// keep those whole-file reads too if libraries of single-file albums scan slowly.
pub fn scan(found: &Found, previous: &HashMap<String, LocalTrack>, art_dir: Option<&Path>, mut progress: impl FnMut(usize)) -> Vec<LocalTrack> {
    let sheets = cue::assign(&found.sheets, &found.audio);
    let mut tracks = Vec::with_capacity(found.audio.len());
    for (i, path) in found.audio.iter().enumerate() {
        if i % 200 == 0 {
            progress(i);
        }
        let Some(whole) = whole_file(path, previous, art_dir) else { continue };
        match sheets.get(path).and_then(|sheet| cut(&whole, sheet)) {
            Some(cut) => tracks.extend(cut),
            None => tracks.push(whole),
        }
    }
    tracks
}

fn cut(whole: &LocalTrack, sheet: &cue::Sheet) -> Option<Vec<LocalTrack>> {
    let tracks = cue::tracks(whole, sheet);
    if tracks.is_none() {
        eprintln!("[library] the CUE sheet for {} describes a longer recording; listing the file whole", whole.path);
    }
    tracks
}

/// The file as one track, reused from the last scan when its size and date haven't changed.
fn whole_file(path: &Path, previous: &HashMap<String, LocalTrack>, art_dir: Option<&Path>) -> Option<LocalTrack> {
    let (size, modified) = stamp(path)?;
    match previous.get(path.to_string_lossy().as_ref()) {
        Some(old) if old.size == size && old.modified == modified => Some(old.clone()),
        // lofty parses untrusted bytes: a panic there skips the file instead of the scan.
        _ => contain(|| read(path, size, modified, art_dir)).map_err(|e| eprintln!("[library] skipped {}: {e}", path.display())).ok(),
    }
}

/// One file read fresh, whatever the last scan knew about it.
pub fn read_one(path: &Path, art_dir: Option<&Path>) -> Result<LocalTrack, String> {
    let (size, modified) = stamp(path).ok_or("the file couldn't be found")?;
    contain(|| read(path, size, modified, art_dir))
}

fn read(path: &Path, size: u64, modified: u64, art_dir: Option<&Path>) -> Result<LocalTrack, String> {
    let file = lofty::read_from_path(path).map_err(|e| e.to_string())?;
    let duration_ms = file.properties().duration().as_millis() as u64;
    let tag = file.primary_tag().or_else(|| file.first_tag());
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let text = |key: ItemKey| tag.and_then(|t| t.get_string(key)).map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let mut artists: Vec<String> =
        tag.map(|t| t.get_strings(ItemKey::TrackArtist).map(str::trim).filter(|s| !s.is_empty()).map(String::from).collect()).unwrap_or_default();
    if artists.is_empty() {
        artists.push(UNKNOWN_ARTIST.into());
    }
    // Opus-style R128 tags stand in when a file has no ReplayGain tag.
    let gain = |replay_gain: ItemKey, r128: ItemKey| {
        text(replay_gain).and_then(|g| loudness::parse_gain(&g)).or_else(|| text(r128).and_then(|g| loudness::parse_r128(&g)))
    };
    let album_artist = text(ItemKey::AlbumArtist).unwrap_or_else(|| artists[0].clone());
    Ok(LocalTrack {
        id: track_id(path),
        path: path.to_string_lossy().into_owned(),
        title: tag.and_then(|t| t.title()).map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).unwrap_or(stem),
        artists,
        album: tag.and_then(|t| t.album()).map(|a| a.trim().to_string()).unwrap_or_default(),
        album_artist,
        track_no: tag.and_then(|t| t.track()),
        disc_no: tag.and_then(|t| t.disk()),
        year: tag.and_then(|t| t.date()).map(|d| u32::from(d.year)),
        duration_ms,
        artwork: tag.and_then(|t| save_artwork(t, art_dir?)),
        replay_gain_db: gain(ItemKey::ReplayGainTrackGain, ItemKey::R128TrackGain),
        replay_peak: text(ItemKey::ReplayGainTrackPeak).and_then(|p| loudness::parse_peak(&p)),
        album_gain_db: gain(ItemKey::ReplayGainAlbumGain, ItemKey::R128AlbumGain),
        album_peak: text(ItemKey::ReplayGainAlbumPeak).and_then(|p| loudness::parse_peak(&p)),
        size,
        modified,
        clip: None,
    })
}

/// Writes the front cover (or first picture) once per unique image; returns its file path.
fn save_artwork(tag: &Tag, dir: &Path) -> Option<String> {
    let pictures = tag.pictures();
    let picture = pictures.iter().find(|p| p.pic_type() == PictureType::CoverFront).or(pictures.first())?;
    let data = picture.data();
    if data.is_empty() || data.len() > MAX_ARTWORK_BYTES {
        return None;
    }
    let ext = match picture.mime_type() {
        Some(MimeType::Png) => "png",
        Some(MimeType::Gif) => "gif",
        Some(MimeType::Bmp) => "bmp",
        _ => "jpg",
    };
    let file = dir.join(format!("{:x}.{ext}", md5::compute(data)));
    if !file.exists() {
        fs::create_dir_all(dir).ok()?;
        if let Err(e) = fs::write(&file, data) {
            eprintln!("[library] couldn't save artwork: {e}");
            return None;
        }
    }
    Some(file.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::decoder::tests::write_wav;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("carbon-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Album/.hidden")).unwrap();
        dir
    }

    fn only(audio: &[PathBuf]) -> Found {
        Found { audio: audio.to_vec(), sheets: Vec::new() }
    }

    /// A sheet that fits its file replaces the file with its tracks; any other sheet changes nothing.
    #[test]
    fn a_cue_sheet_splits_its_file_and_keeps_ids_across_scans() {
        let dir = temp_dir("cue");
        let album = dir.join("Album/Kind of Blue.wav");
        write_wav(&album, 8000, 2, 5.0, 0.5);
        for name in ["Single", "01", "02"] {
            write_wav(&dir.join(format!("Album/{name}.wav")), 8000, 2, 1.0, 0.5);
        }
        fs::write(dir.join("Album/Kind of Blue.cue"), cue::tests::SHEET).unwrap();
        fs::write(dir.join("Album/Single.cue"), "FILE Single.wav WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 03:00:00\n").unwrap();
        fs::write(dir.join("Album/per-track.cue"), "FILE 01.wav WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nFILE 02.wav WAVE\nTRACK 02 AUDIO\nINDEX 01 00:00:00\n").unwrap();

        let found = find(std::slice::from_ref(&dir));
        assert_eq!((found.audio.len(), found.sheets.len()), (4, 3));
        let tracks = scan(&found, &HashMap::new(), None, |_| {});
        let listed: Vec<_> = tracks.iter().map(|t| (t.title.as_str(), t.duration_ms, t.clip.is_some())).collect();
        let cut = [("So What", 2000, true), ("Freddie Freeloader", 1493, true), ("Blue in \"Green\"", 1507, true)];
        assert_eq!(listed, [&[("01", 1000, false), ("02", 1000, false)], &cut[..], &[("Single", 1000, false)]].concat());
        let album = &found.audio[2]; // spelled as the walk found it, which is what ids are made from
        assert!(tracks.iter().all(|t| t.id != track_id(album))); // the long file is no longer a song of its own
        assert!(tracks[2..5].iter().all(|t| Path::new(&t.path) == album));
        assert_eq!(tracks[3].id, cue::track_id(album, 2));

        let previous = tracks.iter().filter(|t| t.clip.is_none()).map(|t| (t.path.clone(), t.clone())).collect();
        assert_eq!(scan(&found, &previous, None, |_| {}), tracks);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn finds_audio_and_skips_hidden_and_other_files() {
        let dir = temp_dir("find");
        write_wav(&dir.join("Album/01 Song.wav"), 8000, 1, 0.1, 0.5);
        write_wav(&dir.join("Album/.hidden/secret.wav"), 8000, 1, 0.1, 0.5);
        fs::write(dir.join("Album/cover.jpg"), b"jpg").unwrap();
        fs::write(dir.join("notes.txt"), b"hi").unwrap();
        fs::write(dir.join("Album/01 Song.CUE"), b"").unwrap();
        fs::write(dir.join("Album/.hidden/secret.cue"), b"").unwrap();
        let found = find(std::slice::from_ref(&dir));
        assert_eq!(found, Found { audio: vec![dir.join("Album/01 Song.wav")], sheets: vec![dir.join("Album/01 Song.CUE")] });
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_untagged_files_and_reuses_unchanged_ones() {
        let dir = temp_dir("scan");
        let song = dir.join("Album/01 Song.wav");
        write_wav(&song, 8000, 2, 0.5, 0.5);
        let tracks = scan(&only(std::slice::from_ref(&song)), &HashMap::new(), None, |_| {});
        assert_eq!(tracks.len(), 1);
        let t = &tracks[0];
        assert_eq!((t.title.as_str(), t.artists[0].as_str()), ("01 Song", UNKNOWN_ARTIST));
        assert_eq!(t.duration_ms, 500);
        assert_eq!(t.id, track_id(&song));

        let mut cached = t.clone();
        cached.title = "From cache".into();
        let previous = HashMap::from([(t.path.clone(), cached)]);
        let again = scan(&only(std::slice::from_ref(&song)), &previous, None, |_| {});
        assert_eq!(again[0].title, "From cache");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn skips_corrupt_files_instead_of_failing_the_scan() {
        let dir = temp_dir("corrupt");
        let good = dir.join("Album/good.wav");
        write_wav(&good, 8000, 1, 0.1, 0.5);
        let mut files = vec![good.clone()];
        for (name, bytes) in [("noise.flac", b"fLaC\xff\xff\x00\x01garbage".to_vec()), ("cut.mp3", b"ID3\x04\x00\x00\x7f\x7f\x7f\x7f".to_vec()), ("empty.ogg", Vec::new())] {
            let path = dir.join("Album").join(name);
            fs::write(&path, bytes).unwrap();
            files.push(path);
        }
        let tracks = scan(&only(&files), &HashMap::new(), Some(&dir.join("art")), |_| {});
        assert_eq!(tracks.iter().map(|t| t.path.clone()).collect::<Vec<_>>(), vec![good.to_string_lossy().into_owned()]);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn recognises_extensions_case_insensitively() {
        assert!(is_audio(Path::new("a/B.FLAC")));
        assert!(!is_audio(Path::new("a/b.opus")));
        assert!(!is_audio(Path::new("a/flac")));
    }
}
