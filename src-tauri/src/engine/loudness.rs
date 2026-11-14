//! Loudness normalization for local files: ReplayGain tags when the file has them, otherwise an
//! EBU R128 measurement made once in the background and cached by path, size and mtime. A track
//! cut from a longer file by a CUE sheet is measured, and cached, as its own range of that file.
use super::contain::contain;
use super::decoder::Decoder;
use super::queue::{Clip, QueueTrack};
use super::sound::TagGain;
use ebur128::{EbuR128, Mode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::Receiver;

/// ReplayGain 2.0 reference level, so tag gains and measured gains mean the same thing.
pub const TARGET_LUFS: f64 = -18.0;
const MAX_BOOST_DB: f32 = 12.0;
const MAX_CUT_DB: f32 = -24.0;
/// Keep normalised peaks at or below -1 dBFS.
const PEAK_CEILING_DB: f32 = -1.0;
const CACHE_FILE: &str = "loudness.json";
/// R128 tags aim for -23 LUFS; ReplayGain 2.0 aims 5 dB higher.
const R128_TO_REPLAYGAIN_DB: f32 = 5.0;

/// "-6.20 dB", "+1.5dB", "−3 dB" (Unicode minus) → dB.
pub fn parse_gain(text: &str) -> Option<f32> {
    let cleaned = text.trim().replace('\u{2212}', "-");
    let number = cleaned.trim_end_matches(|c: char| c.is_ascii_alphabetic() || c.is_whitespace());
    number.trim().parse::<f32>().ok().filter(|g| g.is_finite() && g.abs() < 60.0)
}

pub fn parse_peak(text: &str) -> Option<f32> {
    text.trim().parse::<f32>().ok().filter(|p| p.is_finite() && *p > 0.0 && *p < 16.0)
}

/// Opus-style `R128_TRACK_GAIN`: a whole number of 1/256 dB steps → ReplayGain-referenced dB.
pub fn parse_r128(text: &str) -> Option<f32> {
    text.trim().parse::<i16>().ok().map(|q| f32::from(q) / 256.0 + R128_TO_REPLAYGAIN_DB)
}

/// The gain a track's own tags ask for, if the listener wants tags used. Album mode falls back
/// to the track tag, so a loose single in an album queue is still levelled.
pub fn tag_gain_db(track: &QueueTrack, mode: TagGain) -> Option<f32> {
    let own = || track.replay_gain_db.map(|g| normalization_db(g, track.replay_peak));
    match mode {
        TagGain::Off => None,
        TagGain::Track => own(),
        TagGain::Album => track.album_gain_db.map(|g| normalization_db(g, track.album_peak)).or_else(own),
    }
}

pub fn gain_for_lufs(lufs: f64) -> f32 {
    (TARGET_LUFS - lufs) as f32
}

/// The gain actually applied: clamped, and lowered so the loudest sample stays under the ceiling.
pub fn normalization_db(gain_db: f32, peak: Option<f32>) -> f32 {
    let mut gain = gain_db.clamp(MAX_CUT_DB, MAX_BOOST_DB);
    if let Some(peak) = peak.filter(|p| *p > 0.0) {
        gain = gain.min(PEAK_CEILING_DB - 20.0 * peak.log10());
    }
    gain
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
struct Entry {
    size: u64,
    modified: u64,
    gain_db: f32,
    peak: f32,
}

fn stamp(path: &Path) -> Option<(u64, u64)> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
    Some((meta.len(), modified))
}

/// Integrated loudness and sample peak of `clip` of a file. Slow (decodes all of it), so it only
/// ever runs on the analysis thread.
fn measure(path: &Path, clip: Clip) -> Result<(f32, f32), String> {
    contain(|| measure_unguarded(path, clip))
}

fn measure_unguarded(path: &Path, clip: Clip) -> Result<(f32, f32), String> {
    let mut decoder = Decoder::open(path)?;
    if clip.start_ms > 0 {
        decoder.seek(clip.start_ms)?;
    }
    let rate = u64::from(decoder.rate());
    // Frames still to measure: to the end of the file, or as far as a CUE track runs.
    let mut left = clip.end_ms.map_or(u64::MAX, |end| end.saturating_sub(clip.start_ms) * rate / 1000);
    let mut meter = EbuR128::new(2, decoder.rate(), Mode::I | Mode::SAMPLE_PEAK).map_err(|e| e.to_string())?;
    let mut chunk = Vec::new();
    while left > 0 && decoder.next_chunk(&mut chunk)? {
        let frames = ((chunk.len() / 2) as u64).min(left);
        meter.add_frames_f32(&chunk[..frames as usize * 2]).map_err(|e| e.to_string())?;
        left -= frames;
        chunk.clear();
    }
    let lufs = meter.loudness_global().map_err(|e| e.to_string())?;
    if !lufs.is_finite() {
        return Ok((0.0, 1.0)); // digital silence: leave it alone
    }
    let peak = (0..2).filter_map(|c| meter.sample_peak(c).ok()).fold(0.0, f64::max);
    Ok((gain_for_lufs(lufs), peak as f32))
}

pub struct Request {
    pub id: String,
    pub path: PathBuf,
    pub clip: Clip,
}

/// Whole files are cached under their path; a CUE track under its path and range.
fn cache_key(path: &Path, clip: Clip) -> String {
    let path = path.to_string_lossy();
    match clip.end_ms {
        _ if clip.is_whole() => path.into_owned(),
        Some(end_ms) => format!("{path}#{}-{end_ms}", clip.start_ms),
        None => format!("{path}#{}-", clip.start_ms),
    }
}

/// Background worker: answers from the cache or measures, then reports `(id, gain_db)`.
pub fn run_analyzer(cache_dir: Option<PathBuf>, requests: Receiver<Request>, report: impl Fn(String, f32)) {
    let file = cache_dir.map(|d| d.join(CACHE_FILE));
    let mut cache: HashMap<String, Entry> =
        file.as_ref().and_then(|f| fs::read_to_string(f).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
    for Request { id, path, clip } in requests {
        let key = cache_key(&path, clip);
        let Some((size, modified)) = stamp(&path) else { continue };
        let hit = cache.get(&key).filter(|e| e.size == size && e.modified == modified).copied();
        let entry = match hit {
            Some(e) => e,
            None => match measure(&path, clip) {
                Ok((gain_db, peak)) => {
                    let e = Entry { size, modified, gain_db, peak };
                    cache.insert(key, e);
                    save(file.as_deref(), &cache);
                    e
                }
                Err(e) => {
                    eprintln!("[loudness] couldn't measure {}: {e}", path.display());
                    continue;
                }
            },
        };
        report(id, normalization_db(entry.gain_db, Some(entry.peak)));
    }
}

fn save(file: Option<&Path>, cache: &HashMap<String, Entry>) {
    let Some(file) = file else { return };
    if let Some(dir) = file.parent() {
        let _ = fs::create_dir_all(dir);
    }
    match serde_json::to_string(cache) {
        Ok(text) => {
            if let Err(e) = fs::write(file, text) {
                eprintln!("[loudness] couldn't save the cache: {e}");
            }
        }
        Err(e) => eprintln!("[loudness] couldn't encode the cache: {e}"),
    }
}

pub fn delete_cache(cache_dir: &Path) -> Result<(), String> {
    match fs::remove_file(cache_dir.join(CACHE_FILE)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("could not remove the loudness cache: {e}")),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::decoder::tests::temp_wav;

    #[test]
    fn parses_replaygain_strings() {
        assert_eq!(parse_gain("-6.20 dB"), Some(-6.2));
        assert_eq!(parse_gain("+1.5dB"), Some(1.5));
        assert_eq!(parse_gain("\u{2212}3 dB"), Some(-3.0));
        assert_eq!(parse_gain("loud"), None);
        assert_eq!(parse_gain("-999 dB"), None);
        assert_eq!(parse_peak("0.988"), Some(0.988));
        assert_eq!(parse_peak("-1"), None);
    }

    #[test]
    fn parses_r128_gains_onto_the_replaygain_reference() {
        assert_eq!(parse_r128("0"), Some(5.0));
        assert_eq!(parse_r128(" -1280 "), Some(0.0));
        assert_eq!(parse_r128("256"), Some(6.0));
        assert_eq!(parse_r128("-6.2 dB"), None);
        assert_eq!(parse_r128("99999"), None);
    }

    #[test]
    fn tags_are_used_only_in_the_chosen_mode() {
        let track = |album: Option<f32>| QueueTrack {
            id: "t".into(),
            path: "t.flac".into(),
            title: "T".into(),
            replay_gain_db: Some(-7.0),
            replay_peak: None,
            album_gain_db: album,
            album_peak: Some(0.5),
            clip: Clip::default(),
        };
        assert_eq!(tag_gain_db(&track(Some(-4.0)), TagGain::Off), None);
        assert_eq!(tag_gain_db(&track(Some(-4.0)), TagGain::Track), Some(-7.0));
        assert_eq!(tag_gain_db(&track(Some(-4.0)), TagGain::Album), Some(-4.0));
        assert_eq!(tag_gain_db(&track(None), TagGain::Album), Some(-7.0));
        // The album peak caps an album boost just as the track peak caps a track boost.
        assert!((tag_gain_db(&track(Some(9.0)), TagGain::Album).unwrap() - 5.021).abs() < 0.01);
        let untagged = QueueTrack { replay_gain_db: None, ..track(None) };
        assert_eq!(tag_gain_db(&untagged, TagGain::Track), None);
    }

    #[test]
    fn gain_moves_tracks_to_the_target() {
        assert_eq!(gain_for_lufs(-18.0), 0.0);
        assert_eq!(gain_for_lufs(-9.0), -9.0);
        assert_eq!(gain_for_lufs(-23.0), 5.0);
    }

    #[test]
    fn clamps_and_protects_peaks() {
        assert_eq!(normalization_db(30.0, None), MAX_BOOST_DB);
        assert_eq!(normalization_db(-40.0, None), MAX_CUT_DB);
        // A peak at 0.5 (-6 dBFS) allows at most +5 dB before hitting -1 dBFS.
        assert!((normalization_db(8.0, Some(0.5)) - 5.021).abs() < 0.01);
        assert_eq!(normalization_db(-3.0, Some(0.5)), -3.0);
    }

    /// Each CUE track gets its own measurement of its own part of the file.
    #[test]
    fn measures_and_caches_a_cue_track_as_its_own_range() {
        let path = temp_wav("loud-clip", 44_100, 2, 4.0);
        let mut bytes = fs::read(&path).unwrap();
        for sample in bytes[44 + 2 * 44_100 * 4..].as_chunks_mut::<2>().0 {
            *sample = (i16::from_le_bytes(*sample) / 4).to_le_bytes(); // the second half is 12 dB quieter
        }
        fs::write(&path, bytes).unwrap();
        let (loud, quiet) = (Clip { start_ms: 0, end_ms: Some(2000) }, Clip { start_ms: 2000, end_ms: None });
        let (loud_gain, loud_peak) = measure(&path, loud).unwrap();
        let (quiet_gain, quiet_peak) = measure(&path, quiet).unwrap();
        assert!((loud_gain + 11.3).abs() < 1.0, "{loud_gain}");
        assert!((quiet_gain - loud_gain - 12.04).abs() < 0.2, "{quiet_gain}");
        assert!((loud_peak - 0.5).abs() < 0.01 && (quiet_peak - 0.125).abs() < 0.01);

        let dir = std::env::temp_dir().join(format!("carbon-test-{}-cache-clip", std::process::id()));
        let (tx, rx) = std::sync::mpsc::channel();
        for (id, clip) in [("loud", loud), ("quiet", quiet), ("loud again", loud)] {
            tx.send(Request { id: id.into(), path: path.clone(), clip }).unwrap();
        }
        drop(tx);
        let results = std::sync::Mutex::new(Vec::new());
        run_analyzer(Some(dir.clone()), rx, |id, g| results.lock().unwrap().push((id, g)));
        let results = results.into_inner().unwrap();
        assert_eq!(results[0].1, results[2].1);
        assert!(results[1].1 > results[0].1 + 6.0, "{results:?}"); // the quiet track is raised further (its peak caps the boost)
        assert_ne!(cache_key(&path, loud), cache_key(&path, quiet));
        assert_eq!(cache_key(&path, Clip::default()), path.to_string_lossy());
        let _ = fs::remove_dir_all(dir);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn measures_a_sine_and_caches_it() {
        let path = temp_wav("loud", 44_100, 2, 2.0);
        let (gain, peak) = measure(&path, Clip::default()).unwrap();
        // A 0.5-amplitude stereo sine: -0.691 + 10·log10(2 × 0.125) ≈ -6.7 LUFS → about -11.3 dB.
        assert!((gain + 11.3).abs() < 1.0, "gain {gain}");
        assert!((peak - 0.5).abs() < 0.01);

        let dir = std::env::temp_dir().join(format!("carbon-test-{}-cache", std::process::id()));
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(Request { id: "a".into(), path: path.clone(), clip: Clip::default() }).unwrap();
        tx.send(Request { id: "b".into(), path: path.clone(), clip: Clip::default() }).unwrap();
        drop(tx);
        let results = std::sync::Mutex::new(Vec::new());
        run_analyzer(Some(dir.clone()), rx, |id, g| results.lock().unwrap().push((id, g)));
        let results = results.into_inner().unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].1, results[1].1);
        assert!(dir.join(CACHE_FILE).exists());
        let _ = fs::remove_dir_all(dir);
        let _ = fs::remove_file(path);
    }
}
