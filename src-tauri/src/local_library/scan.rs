//! Walks library folders for audio files and reads their tags and embedded artwork with lofty.
//! Files whose size and mtime haven't changed since the last scan are reused as-is.
use super::LocalTrack;
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
const MAX_DEPTH: usize = 32;
const MAX_ARTWORK_BYTES: usize = 16 * 1024 * 1024;
const UNKNOWN_ARTIST: &str = "Unknown artist";

pub fn track_id(path: &Path) -> String {
    format!("{:x}", md5::compute(path.to_string_lossy().as_bytes()))
}

fn is_audio(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Every audio file under `roots`, without following links or entering hidden folders.
pub fn find_audio(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack: Vec<(PathBuf, usize)> = roots.iter().map(|r| (r.clone(), 0)).collect();
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else { continue };
            let path = entry.path();
            let hidden = entry.file_name().to_string_lossy().starts_with('.');
            if kind.is_dir() && !hidden && depth < MAX_DEPTH {
                stack.push((path, depth + 1));
            } else if kind.is_file() && is_audio(&path) {
                found.push(path);
                if found.len() >= MAX_FILES {
                    return found;
                }
            }
        }
    }
    found.sort();
    found
}

fn stamp(path: &Path) -> Option<(u64, u64)> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
    Some((meta.len(), modified))
}

pub fn scan(files: &[PathBuf], previous: &HashMap<String, LocalTrack>, art_dir: Option<&Path>, mut progress: impl FnMut(usize)) -> Vec<LocalTrack> {
    let mut tracks = Vec::with_capacity(files.len());
    for (i, path) in files.iter().enumerate() {
        if i % 200 == 0 {
            progress(i);
        }
        let Some((size, modified)) = stamp(path) else { continue };
        let key = path.to_string_lossy();
        match previous.get(key.as_ref()) {
            Some(old) if old.size == size && old.modified == modified => tracks.push(old.clone()),
            _ => match read(path, size, modified, art_dir) {
                Ok(track) => tracks.push(track),
                Err(e) => eprintln!("[library] skipped {}: {e}", path.display()),
            },
        }
    }
    tracks
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
        replay_gain_db: text(ItemKey::ReplayGainTrackGain).and_then(|g| loudness::parse_gain(&g)),
        replay_peak: text(ItemKey::ReplayGainTrackPeak).and_then(|p| loudness::parse_peak(&p)),
        size,
        modified,
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

    #[test]
    fn finds_audio_and_skips_hidden_and_other_files() {
        let dir = temp_dir("find");
        write_wav(&dir.join("Album/01 Song.wav"), 8000, 1, 0.1, 0.5);
        write_wav(&dir.join("Album/.hidden/secret.wav"), 8000, 1, 0.1, 0.5);
        fs::write(dir.join("Album/cover.jpg"), b"jpg").unwrap();
        fs::write(dir.join("notes.txt"), b"hi").unwrap();
        let found = find_audio(std::slice::from_ref(&dir));
        assert_eq!(found, vec![dir.join("Album/01 Song.wav")]);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_untagged_files_and_reuses_unchanged_ones() {
        let dir = temp_dir("scan");
        let song = dir.join("Album/01 Song.wav");
        write_wav(&song, 8000, 2, 0.5, 0.5);
        let tracks = scan(std::slice::from_ref(&song), &HashMap::new(), None, |_| {});
        assert_eq!(tracks.len(), 1);
        let t = &tracks[0];
        assert_eq!((t.title.as_str(), t.artists[0].as_str()), ("01 Song", UNKNOWN_ARTIST));
        assert_eq!(t.duration_ms, 500);
        assert_eq!(t.id, track_id(&song));

        let mut cached = t.clone();
        cached.title = "From cache".into();
        let previous = HashMap::from([(t.path.clone(), cached)]);
        let again = scan(std::slice::from_ref(&song), &previous, None, |_| {});
        assert_eq!(again[0].title, "From cache");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn recognises_extensions_case_insensitively() {
        assert!(is_audio(Path::new("a/B.FLAC")));
        assert!(!is_audio(Path::new("a/b.opus")));
        assert!(!is_audio(Path::new("a/flac")));
    }
}
