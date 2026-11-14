//! Finds long digital silence at the start and end of a file so playback can skip it. Short
//! silences are left alone: they are the pauses an album's gapless tracks are meant to have.
//! The file is read with its own decoder before playback, so the player knows where the music
//! starts and stops up front and never has to hold audio back while it plays.
use super::decoder::Decoder;
use std::path::Path;

/// -60 dBFS.
const QUIET: f32 = 0.001;
/// Silence has to last longer than this to be trimmed.
const MIN_RUN_MS: u64 = 1000;
/// A file still silent after this long is left as it is.
const MAX_LEAD_MS: u64 = 30_000;
/// How far back from the end to look. A wider window is tried only when the one before was
/// silent throughout, so an ordinary track costs a few seconds of decoding.
const TAIL_WINDOWS_MS: [u64; 3] = [8_000, 60_000, 600_000];
/// Silence kept on each side of the music. It covers a fade's last moments, and the few tens of
/// milliseconds by which a lossy format's timestamps can differ from a count of decoded frames.
const MARGIN_MS: u64 = 100;

/// The part of a file worth playing.
#[derive(Clone, Copy, Default, PartialEq, Debug)]
pub struct Span {
    /// Where to start; 0 when the file doesn't open with a long silence.
    pub lead_ms: u64,
    /// Frame (at the file's rate) to stop at; None plays to the end.
    pub end_frame: Option<u64>,
}

fn loud(frame: &[f32; 2]) -> bool {
    frame[0].abs() > QUIET || frame[1].abs() > QUIET
}

/// Index of the first frame above the threshold in interleaved stereo.
pub fn first_sound(stereo: &[f32]) -> Option<usize> {
    stereo.as_chunks::<2>().0.iter().position(loud)
}

pub fn last_sound(stereo: &[f32]) -> Option<usize> {
    stereo.as_chunks::<2>().0.iter().rposition(loud)
}

/// Milliseconds to skip for `silent_frames` of opening silence: all but the margin, or none if
/// the silence is short.
pub fn lead_to_skip(silent_frames: u64, rate: u64) -> u64 {
    let ms = silent_frames * 1000 / rate.max(1);
    if ms > MIN_RUN_MS { ms - MARGIN_MS } else { 0 }
}

/// Where to stop when sound last ended at frame `sound_end` of a file `end` frames long.
pub fn end_to_cut(sound_end: u64, end: u64, rate: u64) -> Option<u64> {
    let silent_ms = end.saturating_sub(sound_end) * 1000 / rate.max(1);
    (silent_ms > MIN_RUN_MS).then(|| sound_end + MARGIN_MS * rate / 1000)
}

/// Decodes the start and the last few seconds of `path`. Files that are silent throughout, or
/// that can't be seeked, come back untrimmed.
pub fn scan(path: &Path) -> Result<Span, String> {
    let mut decoder = Decoder::open(path)?;
    let rate = u64::from(decoder.rate());
    let Some(lead) = leading(&mut decoder, rate)? else { return Ok(Span::default()) };
    let end_frame = match decoder.duration_ms() {
        Some(total_ms) => trailing(&mut decoder, rate, total_ms)?,
        None => None,
    };
    Ok(Span { lead_ms: lead_to_skip(lead, rate), end_frame })
}

/// Frames before the first sound; None if there's none within `MAX_LEAD_MS`.
fn leading(decoder: &mut Decoder, rate: u64) -> Result<Option<u64>, String> {
    let (mut chunk, mut frames) = (Vec::new(), 0u64);
    while frames <= MAX_LEAD_MS * rate / 1000 && decoder.next_chunk(&mut chunk)? {
        if let Some(i) = first_sound(&chunk) {
            return Ok(Some(frames + i as u64));
        }
        frames += (chunk.len() / 2) as u64;
        chunk.clear();
    }
    Ok(None)
}

fn trailing(decoder: &mut Decoder, rate: u64, total_ms: u64) -> Result<Option<u64>, String> {
    for window in TAIL_WINDOWS_MS {
        let from_ms = total_ms.saturating_sub(window);
        let (sound_end, end) = tail(decoder, from_ms, rate)?;
        if let Some(sound_end) = sound_end {
            return Ok(end_to_cut(sound_end, end, rate));
        }
        if from_ms == 0 {
            break;
        }
    }
    Ok(None)
}

/// (frame just after the last sound, frame the file ends at), decoding from `from_ms`.
fn tail(decoder: &mut Decoder, from_ms: u64, rate: u64) -> Result<(Option<u64>, u64), String> {
    let mut at = decoder.seek(from_ms)? * rate / 1000;
    let (mut chunk, mut sound_end) = (Vec::new(), None);
    while decoder.next_chunk(&mut chunk)? {
        if let Some(i) = last_sound(&chunk) {
            sound_end = Some(at + i as u64 + 1);
        }
        at += (chunk.len() / 2) as u64;
        chunk.clear();
    }
    Ok((sound_end, at))
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::engine::decoder::tests::temp_wav;
    use std::path::PathBuf;

    const RATE: u64 = 8_000;
    const MARGIN: u64 = MARGIN_MS * RATE / 1000;

    /// A stereo 8 kHz sine with the given stretches (in seconds) zeroed out.
    pub fn wav_with_silence(name: &str, seconds: f32, silent: &[(f32, f32)]) -> PathBuf {
        let path = temp_wav(name, RATE as u32, 2, seconds);
        let mut bytes = std::fs::read(&path).unwrap();
        for (from, to) in silent {
            let byte = |s: f32| 44 + (s * RATE as f32) as usize * 4;
            bytes[byte(*from)..byte(*to)].fill(0);
        }
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn finds_the_first_and_last_sound() {
        let audio = [0.0, 0.0, 0.0005, -0.0005, 0.0, 0.2, -0.3, 0.0, 0.0, 0.0];
        assert_eq!(first_sound(&audio), Some(2));
        assert_eq!(last_sound(&audio), Some(3));
        assert_eq!(first_sound(&[0.0; 8]), None);
        assert_eq!(last_sound(&[]), None);
    }

    #[test]
    fn only_long_runs_are_trimmed() {
        assert_eq!(lead_to_skip(RATE, RATE), 0); // exactly a second is still a gapless pause
        assert_eq!(lead_to_skip(RATE * 3, RATE), 2900);
        assert_eq!(end_to_cut(RATE * 9, RATE * 10, RATE), None);
        assert_eq!(end_to_cut(RATE * 7, RATE * 10, RATE), Some(RATE * 7 + MARGIN));
        assert_eq!(end_to_cut(RATE * 10, RATE * 9, RATE), None);
    }

    #[test]
    fn scans_a_file_with_silence_at_both_ends() {
        let path = wav_with_silence("silence-both", 6.0, &[(0.0, 1.5), (4.0, 6.0)]);
        let span = scan(&path).unwrap();
        assert!(span.lead_ms.abs_diff(1400) <= 1, "{span:?}");
        assert!(span.end_frame.unwrap().abs_diff(RATE * 4 + MARGIN) <= 8, "{span:?}");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn leaves_gapless_pauses_and_silent_files_alone() {
        let short = wav_with_silence("silence-short", 3.0, &[(0.0, 0.5), (2.4, 3.0)]);
        assert_eq!(scan(&short).unwrap(), Span::default());
        let empty = wav_with_silence("silence-all", 2.0, &[(0.0, 2.0)]);
        assert_eq!(scan(&empty).unwrap(), Span::default());
        let _ = std::fs::remove_file(short);
        let _ = std::fs::remove_file(empty);
    }

    #[test]
    fn widens_the_window_for_a_very_long_tail() {
        let path = wav_with_silence("silence-long", 14.0, &[(2.0, 14.0)]);
        let span = scan(&path).unwrap();
        assert!(span.end_frame.unwrap().abs_diff(RATE * 2 + MARGIN) <= 8, "{span:?}");
        let _ = std::fs::remove_file(path);
    }
}
