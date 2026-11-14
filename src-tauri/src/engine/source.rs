//! One playing file: decoder + resampler + normalization gain, read in device-rate stereo frames.
//! A track cut from a longer file by a CUE sheet plays just its range of that file; every
//! position here is then counted from the track's own start.
use super::decoder::Decoder;
use super::dsp::db_to_gain;
use super::queue::{Clip, QueueTrack};
use super::resample::Resampler;
use super::silence::Span;
use super::timeline::{output_frames, track_ms};

/// Normalization changes glide in over ~50 ms instead of jumping.
const GAIN_GLIDE: f32 = 0.0005;

pub struct Source {
    pub index: usize,
    pub id: String,
    pub title: String,
    decoder: Decoder,
    resampler: Resampler,
    rate: u32,
    ready: Vec<f32>,
    cursor: usize,
    raw: Vec<f32>,
    decoded_all: bool,
    pub duration_ms: u64,
    /// Length of the whole file; 0 if it doesn't say.
    file_ms: u64,
    /// The range of the file this track is.
    clip: Clip,
    /// Output frames to emit, counted from the last seek, before a clipped track is over.
    limit: Option<u64>,
    start_ms: u64,
    emitted: u64,
    /// Playback speed; the resampler squeezes or stretches the track to match.
    speed: f64,
    /// File-rate frame the decoder has reached.
    decoded: u64,
    /// File-rate frame to stop at when trailing silence is skipped.
    cut: Option<u64>,
    gain: f32,
    gain_target: f32,
}

impl Source {
    pub fn open(track: &QueueTrack, index: usize, device_rate: u32, gain_db: f32, speed: f64) -> Result<Source, String> {
        let decoder = Decoder::open(&track.path)?;
        let resampler = Resampler::new(decoder.rate(), device_rate, speed)?;
        let gain = db_to_gain(gain_db);
        let mut source = Source {
            index,
            id: track.id.clone(),
            title: track.title.clone(),
            duration_ms: 0,
            file_ms: decoder.duration_ms().unwrap_or(0),
            clip: Clip::default(),
            limit: None,
            decoder,
            resampler,
            rate: device_rate,
            ready: Vec::new(),
            cursor: 0,
            raw: Vec::new(),
            decoded_all: false,
            start_ms: 0,
            emitted: 0,
            speed,
            decoded: 0,
            cut: None,
            gain,
            gain_target: gain,
        };
        source.set_clip(track.clip);
        if track.clip.start_ms > 0 {
            source.seek(0)?;
        }
        Ok(source)
    }

    /// Points the source at `clip` of its file, standing at the clip's start.
    fn set_clip(&mut self, clip: Clip) {
        let end_ms = clip.end_ms.map_or(self.file_ms, |end| if self.file_ms > 0 { end.min(self.file_ms) } else { end });
        self.clip = clip;
        self.duration_ms = end_ms.saturating_sub(clip.start_ms);
        self.start_ms = 0;
        self.emitted = 0;
        self.limit = self.limit_from(0);
    }

    /// Output frames from `ms` into the track to the clip's end; None when it runs to the end of the file.
    fn limit_from(&self, ms: u64) -> Option<u64> {
        self.clip.end_ms.map(|_| output_frames(self.duration_ms.saturating_sub(ms), self.rate, self.speed))
    }

    /// Whether a clipped track has played right up to its end (and not stopped short of it).
    pub fn at_clip_end(&self) -> bool {
        self.limit.is_some_and(|limit| self.emitted >= limit)
    }

    /// Becomes `track`, the range of the same file that starts where this one ended (the next
    /// track of a CUE sheet). The decoder and resampler carry straight on, so there is no seam.
    pub fn carry_on(&mut self, track: &QueueTrack, index: usize, gain_db: f32) {
        self.index = index;
        self.id = track.id.clone();
        self.title = track.title.clone();
        self.set_clip(track.clip);
        self.set_gain_db(gain_db);
    }

    /// Skips long silence at either end: starts at the first sound and ends after the last.
    pub fn trim(&mut self, span: Span) -> Result<(), String> {
        self.cut = span.end_frame;
        if span.lead_ms > 0 {
            self.seek(span.lead_ms)?;
        }
        Ok(())
    }

    /// Jumps to `ms` of the track and returns the real resume point.
    pub fn seek(&mut self, ms: u64) -> Result<u64, String> {
        let in_file = self.decoder.seek(self.clip.start_ms + ms.min(self.duration_ms.saturating_sub(1)))?;
        let at = in_file.saturating_sub(self.clip.start_ms);
        self.resampler = Resampler::new(self.decoder.rate(), self.rate, self.speed)?;
        self.ready.clear();
        self.cursor = 0;
        self.decoded_all = false;
        self.start_ms = at;
        self.emitted = 0;
        self.limit = self.limit_from(at);
        self.decoded = in_file * u64::from(self.decoder.rate()) / 1000;
        Ok(at)
    }

    pub fn set_gain_db(&mut self, db: f32) {
        self.gain_target = db_to_gain(db);
    }

    /// Position in the track itself, whatever the speed.
    pub fn position_ms(&self) -> u64 {
        self.start_ms + track_ms(self.emitted, self.rate, self.speed)
    }

    /// Where the audio stops: the end of the file, or earlier when trailing silence is skipped.
    fn end_ms(&self) -> u64 {
        let cut_ms = self.cut.map(|frame| frame * 1000 / u64::from(self.decoder.rate()));
        cut_ms.map_or(self.duration_ms, |ms| ms.min(self.duration_ms))
    }

    /// Output frames left before the end, if the file states its length.
    pub fn remaining_frames(&self) -> Option<u64> {
        if let Some(limit) = self.limit {
            return Some(limit.saturating_sub(self.emitted));
        }
        (self.duration_ms > 0).then(|| output_frames(self.end_ms().saturating_sub(self.position_ms()), self.rate, self.speed))
    }

    /// Decodes one more packet into `ready`, stopping at the cut point if there is one.
    fn decode_more(&mut self) -> Result<(), String> {
        self.raw.clear();
        self.decoded_all = !self.decoder.next_chunk(&mut self.raw)?;
        if let Some(cut) = self.cut {
            let left = cut.saturating_sub(self.decoded) as usize;
            if self.raw.len() / 2 >= left {
                self.raw.truncate(left * 2);
                self.decoded_all = true;
            }
        }
        self.decoded += (self.raw.len() / 2) as u64;
        self.resampler.process(&self.raw, self.decoded_all, &mut self.ready)
    }

    /// Fills `out` (interleaved stereo); returns frames written. Fewer than asked = the track ended.
    pub fn read(&mut self, out: &mut [f32]) -> Result<usize, String> {
        let left = self.limit.map_or(u64::MAX, |limit| limit.saturating_sub(self.emitted));
        let wanted = out.len().min(usize::try_from(left.saturating_mul(2)).unwrap_or(usize::MAX));
        while self.ready.len() - self.cursor < wanted && !self.decoded_all {
            self.decode_more()?;
        }
        let n = (self.ready.len() - self.cursor).min(wanted) & !1;
        for (o, frame) in out[..n].as_chunks_mut::<2>().0.iter_mut().zip(self.ready[self.cursor..self.cursor + n].as_chunks::<2>().0) {
            self.gain += (self.gain_target - self.gain) * GAIN_GLIDE;
            o[0] = frame[0] * self.gain;
            o[1] = frame[1] * self.gain;
        }
        self.cursor += n;
        if self.cursor > 1 << 16 {
            self.ready.drain(..self.cursor);
            self.cursor = 0;
        }
        self.emitted += (n / 2) as u64;
        Ok(n / 2)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::engine::decoder::tests::temp_wav;
    use crate::engine::silence::{self, tests::wav_with_silence};
    use std::path::PathBuf;

    /// Reads to the end; returns the frames read.
    fn drain(s: &mut Source) -> usize {
        let mut buf = vec![0.0; 4096];
        let mut total = 0;
        loop {
            let n = s.read(&mut buf).unwrap();
            total += n;
            if n < 2048 {
                return total;
            }
        }
    }

    fn track(path: PathBuf) -> QueueTrack {
        QueueTrack { id: "t".into(), path, title: "Tone".into(), replay_gain_db: None, replay_peak: None, album_gain_db: None, album_peak: None, clip: Clip::default() }
    }

    pub fn clipped(path: PathBuf, id: &str, start_ms: u64, end_ms: Option<u64>) -> QueueTrack {
        QueueTrack { id: id.into(), clip: Clip { start_ms, end_ms }, ..track(path) }
    }

    /// A stereo WAV whose every sample is its own frame number, so audio can be traced to its place in the file.
    pub fn ramp_wav(name: &str, rate: u32, frames: u32) -> PathBuf {
        let path = temp_wav(name, rate, 2, frames as f32 / rate as f32);
        let mut bytes = std::fs::read(&path).unwrap();
        for n in 0..frames as usize {
            let sample = (n as i16).to_le_bytes();
            bytes[44 + n * 4..48 + n * 4].copy_from_slice(&[sample[0], sample[1], sample[0], sample[1]]);
        }
        std::fs::write(&path, bytes).unwrap();
        path
    }

    /// The frame numbers `ramp_wav` audio came from.
    fn frames_of(audio: &[f32]) -> Vec<i64> {
        audio.as_chunks::<2>().0.iter().map(|f| (f64::from(f[0]) * 32768.0).round() as i64).collect()
    }

    #[test]
    fn a_clip_plays_only_its_range_and_counts_from_its_own_start() {
        let path = ramp_wav("source-clip", 8_000, 32_000);
        let mut s = Source::open(&clipped(path.clone(), "two", 1000, Some(2500)), 1, 8_000, 0.0, 1.0).unwrap();
        assert_eq!((s.duration_ms, s.position_ms(), s.remaining_frames()), (1500, 0, Some(12_000)));
        let mut buf = vec![0.0; 40_000];
        assert_eq!(s.read(&mut buf).unwrap(), 12_000); // stops at the clip's end, not the file's
        assert_eq!(frames_of(&buf[..24_000]), (8_000..20_000).collect::<Vec<_>>());
        assert_eq!((s.position_ms(), s.remaining_frames()), (1500, Some(0)));
        assert!(s.at_clip_end());

        // Seeking is within the track, and the end stays where the sheet put it.
        assert_eq!(s.seek(500).unwrap(), 500);
        assert_eq!((s.position_ms(), s.remaining_frames()), (500, Some(8_000)));
        assert_eq!(s.read(&mut buf).unwrap(), 8_000);
        assert_eq!(frames_of(&buf[..4]), vec![12_000, 12_001]);
        assert_eq!(s.seek(99_000).unwrap(), 1499); // clamped inside the track
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn the_last_clip_runs_to_the_end_of_the_file() {
        let path = ramp_wav("source-clip-last", 8_000, 16_000);
        let mut s = Source::open(&clipped(path.clone(), "last", 1500, None), 0, 8_000, 0.0, 1.0).unwrap();
        assert_eq!((s.duration_ms, s.remaining_frames()), (500, Some(4_000)));
        assert_eq!(drain(&mut s), 4_000);
        assert!(!s.at_clip_end()); // it ended with its file, so there is nothing to carry on into
        let _ = std::fs::remove_file(path);
    }

    /// Consecutive CUE tracks are one stream: every frame of the file comes out once, in order,
    /// with no frame dropped or repeated at the joins, resampled or not.
    #[test]
    fn carrying_on_into_the_next_clip_loses_and_repeats_nothing() {
        let path = ramp_wav("source-carry", 8_000, 24_000);
        let parts = [clipped(path.clone(), "a", 0, Some(1013)), clipped(path.clone(), "b", 1013, Some(2000)), clipped(path.clone(), "c", 2000, None)];
        let mut s = Source::open(&parts[0], 0, 8_000, 0.0, 1.0).unwrap();
        let mut heard = read_all(&mut s);
        for (i, next) in parts.iter().enumerate().skip(1) {
            assert!(s.at_clip_end());
            s.carry_on(next, i, 0.0);
            assert_eq!((s.id.as_str(), s.index, s.position_ms()), (next.id.as_str(), i, 0));
            heard.extend(read_all(&mut s));
        }
        assert_eq!(s.duration_ms, 1000);
        assert_eq!(frames_of(&heard), (0..24_000).collect::<Vec<_>>());

        // Resampled (44.1 kHz file, 48 kHz device): the total length is still exact.
        let hi = temp_wav("source-carry-hi", 44_100, 2, 3.0);
        let parts = [clipped(hi.clone(), "a", 0, Some(1013)), clipped(hi.clone(), "b", 1013, None)];
        let mut s = Source::open(&parts[0], 0, 48_000, 0.0, 1.0).unwrap();
        let first = drain(&mut s);
        s.carry_on(&parts[1], 1, 0.0);
        let total = first + drain(&mut s);
        assert!(total.abs_diff(144_000) <= 2, "{total}");
        for file in [path, hi] {
            let _ = std::fs::remove_file(file);
        }
    }

    /// Reads to the end of the track; returns its audio.
    fn read_all(s: &mut Source) -> Vec<f32> {
        let (mut buf, mut heard) = (vec![0.0; 2_000], Vec::new());
        loop {
            let n = s.read(&mut buf).unwrap();
            heard.extend_from_slice(&buf[..n * 2]);
            if n < 1000 {
                return heard;
            }
        }
    }

    #[test]
    fn reads_resampled_frames_until_the_end() {
        let path = temp_wav("source", 44_100, 2, 1.0);
        let mut s = Source::open(&track(path.clone()), 0, 48_000, 0.0, 1.0).unwrap();
        assert_eq!(s.duration_ms, 1000);
        let mut buf = vec![0.0; 4096];
        let mut total = 0;
        loop {
            let n = s.read(&mut buf).unwrap();
            total += n;
            if n < 2048 {
                break;
            }
        }
        assert!((total as i64 - 48_000).abs() <= 2, "{total}"); // exact length keeps albums gapless
        assert_eq!(s.remaining_frames(), Some(0));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn seeking_moves_the_position_and_gain_scales_audio() {
        let path = temp_wav("source-seek", 48_000, 2, 2.0);
        let mut s = Source::open(&track(path.clone()), 0, 48_000, -6.0, 1.0).unwrap();
        assert_eq!(s.seek(1500).unwrap(), 1500);
        assert_eq!(s.position_ms(), 1500);
        let mut buf = vec![0.0; 9600];
        assert_eq!(s.read(&mut buf).unwrap(), 4800);
        assert_eq!(s.position_ms(), 1600);
        let peak = buf.iter().fold(0f32, |m, x| m.max(x.abs()));
        assert!((peak - 0.5 * 0.501).abs() < 0.01, "{peak}");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn speed_shortens_the_output_but_reports_the_true_position() {
        let path = temp_wav("source-speed", 48_000, 2, 2.0);
        let mut s = Source::open(&track(path.clone()), 0, 48_000, 0.0, 2.0).unwrap();
        assert_eq!(s.remaining_frames(), Some(48_000)); // two seconds of track in one of output
        let mut buf = vec![0.0; 24_000 * 2];
        assert_eq!(s.read(&mut buf).unwrap(), 24_000);
        assert_eq!(s.position_ms(), 1000);
        assert_eq!(s.seek(500).unwrap(), 500);
        let total = drain(&mut s);
        assert!(total.abs_diff(36_000) <= 2, "{total}");
        assert_eq!(s.position_ms(), 2000);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn trimming_plays_only_the_part_with_sound() {
        let path = wav_with_silence("source-trim", 6.0, &[(0.0, 1.5), (4.0, 6.0)]);
        let mut s = Source::open(&track(path.clone()), 0, 8_000, 0.0, 1.0).unwrap();
        s.trim(silence::scan(&path).unwrap()).unwrap();
        assert!(s.position_ms().abs_diff(1400) <= 1, "{}", s.position_ms());
        assert!(s.remaining_frames().unwrap().abs_diff(21_600) <= 16); // 2.5 s of sound + 100 ms kept on each side
        let total = drain(&mut s);
        assert!(total.abs_diff(21_600) <= 16, "{total}");
        assert!(s.position_ms().abs_diff(4100) <= 2, "{}", s.position_ms());
        assert_eq!(s.duration_ms, 6000); // the file's real length is still what's reported
        // Seeking back in keeps the trimmed end.
        assert_eq!(s.seek(3000).unwrap(), 3000);
        let total = drain(&mut s);
        assert!(total.abs_diff(8_800) <= 16, "{total}");
        let _ = std::fs::remove_file(path);
    }
}
