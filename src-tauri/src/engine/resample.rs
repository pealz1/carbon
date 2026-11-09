//! Converts decoded audio to the output device's rate (e.g. 44.1 kHz files on a 48 kHz device).
//! Runs on the decode thread, never in the audio callback. The output length is exact
//! (input frames × ratio), so resampled albums stay gapless.
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Async, FixedAsync, Indexing, Resampler as _, SincInterpolationParameters};

const CHANNELS: usize = 2;
const CHUNK_FRAMES: usize = 1024;
/// Silent chunks allowed to flush the filter tail; the sinc delay is far shorter than this.
const MAX_FLUSH_CHUNKS: usize = 16;

pub struct Resampler {
    inner: Option<Async<f32>>,
    ratio: f64,
    pending: Vec<f32>,
    chunk_in: Vec<f32>,
    out: Vec<f32>,
    /// Output frames still owed to the resampler's start-up delay.
    delay: usize,
    fed: u64,
    emitted: u64,
}

impl Resampler {
    pub fn new(from: u32, to: u32) -> Result<Resampler, String> {
        let ratio = f64::from(to) / f64::from(from);
        let inner = if from == to {
            None
        } else {
            let params = SincInterpolationParameters::default();
            let r = Async::<f32>::new_sinc(ratio, 1.0, &params, CHUNK_FRAMES, CHANNELS, FixedAsync::Input)
                .map_err(|e| format!("couldn't convert the sample rate ({e})"))?;
            Some(r)
        };
        let delay = inner.as_ref().map_or(0, |r| r.output_delay());
        let out = vec![0.0; inner.as_ref().map_or(0, |r| r.output_frames_max() * CHANNELS)];
        Ok(Resampler { inner, ratio, pending: Vec::new(), chunk_in: vec![0.0; CHUNK_FRAMES * CHANNELS], out, delay, fed: 0, emitted: 0 })
    }

    /// Feeds interleaved stereo; appends whatever is ready to `dst`. `last` flushes the tail.
    pub fn process(&mut self, input: &[f32], last: bool, dst: &mut Vec<f32>) -> Result<(), String> {
        if self.inner.is_none() {
            dst.extend_from_slice(input);
            return Ok(());
        }
        self.pending.extend_from_slice(input);
        self.fed += (input.len() / CHANNELS) as u64;
        while self.pending.len() >= CHUNK_FRAMES * CHANNELS {
            self.run(CHUNK_FRAMES, dst)?;
        }
        if last {
            let target = (self.fed as f64 * self.ratio).round() as u64;
            if !self.pending.is_empty() {
                self.run(self.pending.len() / CHANNELS, dst)?;
            }
            for _ in 0..MAX_FLUSH_CHUNKS {
                if self.emitted >= target {
                    break;
                }
                self.run(0, dst)?;
            }
            let over = self.emitted.saturating_sub(target) as usize;
            dst.truncate(dst.len().saturating_sub(over * CHANNELS));
            self.emitted -= over as u64;
        }
        Ok(())
    }

    /// One chunk with `valid` real frames from `pending`; the rest is treated as silence.
    fn run(&mut self, valid: usize, dst: &mut Vec<f32>) -> Result<(), String> {
        let Some(inner) = self.inner.as_mut() else { return Ok(()) };
        let samples = valid * CHANNELS;
        self.chunk_in[..samples].copy_from_slice(&self.pending[..samples]);
        self.chunk_in[samples..].fill(0.0);
        let src = InterleavedSlice::new(&self.chunk_in, CHANNELS, CHUNK_FRAMES).map_err(|e| e.to_string())?;
        let out_frames = self.out.len() / CHANNELS;
        let mut out = InterleavedSlice::new_mut(&mut self.out, CHANNELS, out_frames).map_err(|e| e.to_string())?;
        let indexing = (valid < CHUNK_FRAMES).then(|| Indexing::new().partial_len(valid));
        let (_, written) = inner.process_into_buffer(&src, &mut out, indexing.as_ref()).map_err(|e| e.to_string())?;
        let skip = self.delay.min(written);
        self.delay -= skip;
        dst.extend_from_slice(&self.out[skip * CHANNELS..written * CHANNELS]);
        self.emitted += (written - skip) as u64;
        self.pending.drain(..samples);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(frames: usize) -> Vec<f32> {
        (0..frames)
            .flat_map(|n| {
                let s = (n as f32 * 0.0627).sin() * 0.5;
                [s, s]
            })
            .collect()
    }

    #[test]
    fn passes_through_when_rates_match() {
        let mut r = Resampler::new(48_000, 48_000).unwrap();
        let mut out = Vec::new();
        r.process(&[0.1, 0.2, 0.3, 0.4], true, &mut out).unwrap();
        assert_eq!(out, vec![0.1, 0.2, 0.3, 0.4]);
    }

    /// Exact lengths are what keep resampled albums gapless: no lost tail, no padded silence.
    #[test]
    fn output_length_is_exact_for_any_input_length() {
        for (from, to, frames) in [(44_100, 48_000, 44_100), (44_100, 48_000, 1_000), (48_000, 44_100, 12_345), (96_000, 48_000, 70_001)] {
            let mut r = Resampler::new(from, to).unwrap();
            let mut out = Vec::new();
            for chunk in sine(frames).chunks(3000) {
                r.process(chunk, false, &mut out).unwrap();
            }
            r.process(&[], true, &mut out).unwrap();
            let expected = (frames as f64 * f64::from(to) / f64::from(from)).round() as i64;
            assert!((out.len() as i64 / 2 - expected).abs() <= 2, "{from}->{to}: {} vs {expected}", out.len() / 2);
            assert!(out.iter().all(|s| s.abs() < 0.6));
        }
    }

    #[test]
    fn keeps_the_signal_aligned_after_the_start_up_delay() {
        let mut r = Resampler::new(44_100, 48_000).unwrap();
        let mut input = vec![0.0; 44_100 * 2];
        input[..2].copy_from_slice(&[1.0, 1.0]); // an impulse at t = 0
        let mut out = Vec::new();
        r.process(&input, true, &mut out).unwrap();
        let peak = out.as_chunks::<2>().0.iter().enumerate().max_by(|a, b| a.1[0].abs().total_cmp(&b.1[0].abs())).map(|(i, _)| i).unwrap();
        assert!(peak <= 2, "impulse moved to frame {peak}");
    }
}
