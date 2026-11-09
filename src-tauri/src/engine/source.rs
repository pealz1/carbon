//! One playing file: decoder + resampler + normalization gain, read in device-rate stereo frames.
use super::decoder::Decoder;
use super::dsp::db_to_gain;
use super::queue::QueueTrack;
use super::resample::Resampler;

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
    start_ms: u64,
    emitted: u64,
    gain: f32,
    gain_target: f32,
}

impl Source {
    pub fn open(track: &QueueTrack, index: usize, device_rate: u32, gain_db: f32) -> Result<Source, String> {
        let decoder = Decoder::open(&track.path)?;
        let resampler = Resampler::new(decoder.rate(), device_rate)?;
        let gain = db_to_gain(gain_db);
        Ok(Source {
            index,
            id: track.id.clone(),
            title: track.title.clone(),
            duration_ms: decoder.duration_ms().unwrap_or(0),
            decoder,
            resampler,
            rate: device_rate,
            ready: Vec::new(),
            cursor: 0,
            raw: Vec::new(),
            decoded_all: false,
            start_ms: 0,
            emitted: 0,
            gain,
            gain_target: gain,
        })
    }

    /// Jumps to `ms` and returns the real resume point.
    pub fn seek(&mut self, ms: u64) -> Result<u64, String> {
        let at = self.decoder.seek(ms.min(self.duration_ms.saturating_sub(1)))?;
        self.resampler = Resampler::new(self.decoder.rate(), self.rate)?;
        self.ready.clear();
        self.cursor = 0;
        self.decoded_all = false;
        self.start_ms = at;
        self.emitted = 0;
        Ok(at)
    }

    pub fn set_gain_db(&mut self, db: f32) {
        self.gain_target = db_to_gain(db);
    }

    pub fn position_ms(&self) -> u64 {
        self.start_ms + self.emitted * 1000 / u64::from(self.rate)
    }

    /// Frames left before the end, if the file states its length.
    pub fn remaining_frames(&self) -> Option<u64> {
        (self.duration_ms > 0).then(|| {
            let left_ms = self.duration_ms.saturating_sub(self.position_ms());
            left_ms * u64::from(self.rate) / 1000
        })
    }

    /// Fills `out` (interleaved stereo); returns frames written. Fewer than asked = file ended.
    pub fn read(&mut self, out: &mut [f32]) -> Result<usize, String> {
        let wanted = out.len();
        while self.ready.len() - self.cursor < wanted && !self.decoded_all {
            self.raw.clear();
            self.decoded_all = !self.decoder.next_chunk(&mut self.raw)?;
            self.resampler.process(&self.raw, self.decoded_all, &mut self.ready)?;
        }
        let n = (self.ready.len() - self.cursor).min(wanted) & !1;
        for (o, frame) in out[..n].chunks_exact_mut(2).zip(self.ready[self.cursor..self.cursor + n].chunks_exact(2)) {
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
mod tests {
    use super::*;
    use crate::engine::decoder::tests::temp_wav;
    use std::path::PathBuf;

    fn track(path: PathBuf) -> QueueTrack {
        QueueTrack { id: "t".into(), path, title: "Tone".into(), replay_gain_db: None, replay_peak: None }
    }

    #[test]
    fn reads_resampled_frames_until_the_end() {
        let path = temp_wav("source", 44_100, 2, 1.0);
        let mut s = Source::open(&track(path.clone()), 0, 48_000, 0.0).unwrap();
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
        assert!((total as i64 - 48_000).abs() < 1200, "{total}");
        assert_eq!(s.remaining_frames(), Some(0));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn seeking_moves_the_position_and_gain_scales_audio() {
        let path = temp_wav("source-seek", 48_000, 2, 2.0);
        let mut s = Source::open(&track(path.clone()), 0, 48_000, -6.0).unwrap();
        assert_eq!(s.seek(1500).unwrap(), 1500);
        assert_eq!(s.position_ms(), 1500);
        let mut buf = vec![0.0; 9600];
        assert_eq!(s.read(&mut buf).unwrap(), 4800);
        assert_eq!(s.position_ms(), 1600);
        let peak = buf.iter().fold(0f32, |m, x| m.max(x.abs()));
        assert!((peak - 0.5 * 0.501).abs() < 0.01, "{peak}");
        let _ = std::fs::remove_file(path);
    }
}
