//! Converts decoded audio to the output device's rate (e.g. 44.1 kHz files on a 48 kHz device).
//! Runs on the decode thread, never in the audio callback.
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Async, FixedAsync, Indexing, Resampler as _, SincInterpolationParameters};

const CHANNELS: usize = 2;
const CHUNK_FRAMES: usize = 1024;

pub struct Resampler {
    inner: Option<Async<f32>>,
    pending: Vec<f32>,
    out: Vec<f32>,
    /// Output frames still owed to the resampler's start-up delay.
    delay: usize,
}

impl Resampler {
    pub fn new(from: u32, to: u32) -> Result<Resampler, String> {
        let inner = if from == to {
            None
        } else {
            let ratio = f64::from(to) / f64::from(from);
            let params = SincInterpolationParameters::default();
            let r = Async::<f32>::new_sinc(ratio, 1.0, &params, CHUNK_FRAMES, CHANNELS, FixedAsync::Input)
                .map_err(|e| format!("couldn't convert the sample rate ({e})"))?;
            Some(r)
        };
        let delay = inner.as_ref().map_or(0, |r| r.output_delay());
        let out = vec![0.0; inner.as_ref().map_or(0, |r| r.output_frames_max() * CHANNELS)];
        Ok(Resampler { inner, pending: Vec::new(), out, delay })
    }

    /// Feeds interleaved stereo; appends whatever is ready to `dst`. `last` flushes the tail.
    pub fn process(&mut self, input: &[f32], last: bool, dst: &mut Vec<f32>) -> Result<(), String> {
        let Some(inner) = self.inner.as_mut() else {
            dst.extend_from_slice(input);
            return Ok(());
        };
        self.pending.extend_from_slice(input);
        let chunk = CHUNK_FRAMES * CHANNELS;
        while self.pending.len() >= chunk || (last && !self.pending.is_empty()) {
            let frames = (self.pending.len() / CHANNELS).min(CHUNK_FRAMES);
            let mut padded;
            let input: &[f32] = if frames == CHUNK_FRAMES {
                &self.pending[..chunk]
            } else {
                padded = self.pending.clone();
                padded.resize(chunk, 0.0);
                &padded
            };
            let src = InterleavedSlice::new(input, CHANNELS, CHUNK_FRAMES).map_err(|e| e.to_string())?;
            let out_frames = self.out.len() / CHANNELS;
            let mut out = InterleavedSlice::new_mut(&mut self.out, CHANNELS, out_frames).map_err(|e| e.to_string())?;
            let indexing = (frames < CHUNK_FRAMES).then(|| Indexing::new().partial_len(frames));
            let (_, written) = inner.process_into_buffer(&src, &mut out, indexing.as_ref()).map_err(|e| e.to_string())?;
            let skip = self.delay.min(written);
            self.delay -= skip;
            dst.extend_from_slice(&self.out[skip * CHANNELS..written * CHANNELS]);
            self.pending.drain(..frames * CHANNELS);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_through_when_rates_match() {
        let mut r = Resampler::new(48_000, 48_000).unwrap();
        let mut out = Vec::new();
        r.process(&[0.1, 0.2, 0.3, 0.4], true, &mut out).unwrap();
        assert_eq!(out, vec![0.1, 0.2, 0.3, 0.4]);
    }

    #[test]
    fn converts_length_by_the_rate_ratio() {
        let mut r = Resampler::new(44_100, 48_000).unwrap();
        let input: Vec<f32> = (0..44_100).flat_map(|n| {
            let s = (n as f32 * 0.0627).sin() * 0.5;
            [s, s]
        }).collect();
        let mut out = Vec::new();
        for chunk in input.chunks(3000) {
            r.process(chunk, false, &mut out).unwrap();
        }
        r.process(&[], true, &mut out).unwrap();
        let frames = out.len() / 2;
        assert!((frames as i64 - 48_000).abs() < 1200, "{frames} frames");
        assert!(out.iter().all(|s| s.abs() < 0.6));
    }
}
