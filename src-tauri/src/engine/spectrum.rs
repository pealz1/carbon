//! A small spectrum for the visualizer: a 1024-point FFT of the audio reaching the speakers,
//! folded into log-spaced bands. It runs on the decode thread, and only while the interface asks
//! for it, so it costs nothing when no visualizer is on screen.
use std::f32::consts::PI;

pub const BANDS: usize = 32;
pub const SIZE: usize = 1024;
const MIN_HZ: f32 = 40.0;
const MAX_HZ: f32 = 16_000.0;
/// Band energy between these maps onto 0..1.
const FLOOR_DB: f32 = -70.0;
const TOP_DB: f32 = -10.0;
/// Mono history kept so the window can be taken at what's audible, not at what was just decoded.
/// 131072 frames outlast the output ring even at 192 kHz.
const HISTORY: usize = 1 << 17;
/// Share of its height a bar keeps per spectrum while the sound under it dies away.
const FALL: f32 = 0.8;

/// In-place radix-2 FFT. The length must be a power of two.
pub fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let (step_im, step_re) = (-2.0 * PI / len as f32).sin_cos();
        for start in (0..n).step_by(len) {
            let (mut w_re, mut w_im) = (1.0f32, 0.0f32);
            for k in 0..len / 2 {
                let (a, b) = (start + k, start + k + len / 2);
                let (t_re, t_im) = (re[b] * w_re - im[b] * w_im, re[b] * w_im + im[b] * w_re);
                (re[b], im[b]) = (re[a] - t_re, im[a] - t_im);
                (re[a], im[a]) = (re[a] + t_re, im[a] + t_im);
                (w_re, w_im) = (w_re * step_re - w_im * step_im, w_re * step_im + w_im * step_re);
            }
        }
        len <<= 1;
    }
}

/// The FFT bin (fractional) where each band starts, plus where the last one ends. Log-spaced
/// from 40 Hz to 16 kHz, or to the top of the spectrum at low sample rates.
pub fn band_edges(rate: u32) -> [f32; BANDS + 1] {
    let top = MAX_HZ.min(rate as f32 / 2.0);
    std::array::from_fn(|i| MIN_HZ * (top / MIN_HZ).powf(i as f32 / BANDS as f32) * SIZE as f32 / rate.max(1) as f32)
}

/// Energy between bins `lo` and `hi` of a power spectrum. Bass bands are narrower than one bin,
/// so they read the spectrum at their centre instead of all showing the same bin.
pub fn band_power(power: &[f32], lo: f32, hi: f32) -> f32 {
    let at = |bin: usize| power.get(bin).copied().unwrap_or(0.0);
    if hi - lo < 1.0 {
        let centre = (lo + hi) / 2.0;
        let (bin, part) = (centre as usize, centre.fract());
        return at(bin) * (1.0 - part) + at(bin + 1) * part;
    }
    (lo.round() as usize..hi.round() as usize).map(at).sum()
}

/// Band energy → 0..1.
pub fn level(power: f32) -> f32 {
    let db = 10.0 * power.max(1e-12).log10();
    ((db - FLOOR_DB) / (TOP_DB - FLOOR_DB)).clamp(0.0, 1.0)
}

/// What a bar shows next: it jumps up with the music and falls back gradually.
pub fn settle(shown: f32, now: f32) -> f32 {
    now.max(shown * FALL)
}

pub struct Tap {
    history: Vec<f32>,
    window: Vec<f32>,
    edges: [f32; BANDS + 1],
    re: Vec<f32>,
    im: Vec<f32>,
    shown: [f32; BANDS],
}

impl Tap {
    pub fn new(rate: u32) -> Tap {
        let hann = |n: usize| 0.5 - 0.5 * (2.0 * PI * n as f32 / SIZE as f32).cos();
        Tap { history: vec![0.0; HISTORY], window: (0..SIZE).map(hann).collect(), edges: band_edges(rate), re: vec![0.0; SIZE], im: vec![0.0; SIZE], shown: [0.0; BANDS] }
    }

    /// Remembers interleaved stereo that starts at output frame `at`.
    pub fn write(&mut self, at: u64, stereo: &[f32]) {
        for (i, frame) in stereo.as_chunks::<2>().0.iter().enumerate() {
            self.history[(at as usize).wrapping_add(i) % HISTORY] = (frame[0] + frame[1]) * 0.5;
        }
    }

    /// The spectrum of the last `SIZE` frames the device took, up to output frame `played`.
    pub fn read(&mut self, played: u64) -> [f32; BANDS] {
        let first = (played as usize).wrapping_sub(SIZE);
        for (n, (re, weight)) in self.re.iter_mut().zip(&self.window).enumerate() {
            *re = self.history[first.wrapping_add(n) % HISTORY] * weight;
        }
        self.im.fill(0.0);
        fft(&mut self.re, &mut self.im);
        // A Hann-windowed sine of amplitude 1 peaks at SIZE/4, so this puts it at 0 dB.
        let scale = (4.0 / SIZE as f32).powi(2);
        for (re, im) in self.re[..SIZE / 2].iter_mut().zip(&self.im) {
            *re = (*re * *re + im * im) * scale;
        }
        self.shown = std::array::from_fn(|band| {
            let now = level(band_power(&self.re[..SIZE / 2], self.edges[band], self.edges[band + 1]));
            settle(self.shown[band], now)
        });
        // Hundredths are plenty for a bar, and keep the event the interface receives small.
        self.shown.map(|bar| (bar * 100.0).round() / 100.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    fn sine(hz: f32, amplitude: f32, frames: usize) -> Vec<f32> {
        (0..frames).flat_map(|n| [amplitude * (2.0 * PI * hz * n as f32 / RATE as f32).sin(); 2]).collect()
    }

    fn band_of(hz: f32) -> usize {
        let bin = hz * SIZE as f32 / RATE as f32;
        band_edges(RATE).iter().rposition(|edge| *edge <= bin).unwrap()
    }

    #[test]
    fn fft_finds_a_sine_in_its_bin() {
        let mut re: Vec<f32> = (0..64).map(|n| (2.0 * PI * 5.0 * n as f32 / 64.0).cos()).collect();
        let mut im = vec![0.0; 64];
        fft(&mut re, &mut im);
        for (bin, (re, im)) in re.iter().zip(&im).enumerate() {
            let magnitude = re.hypot(*im);
            let expected = if bin == 5 || bin == 59 { 32.0 } else { 0.0 };
            assert!((magnitude - expected).abs() < 1e-3, "bin {bin}: {magnitude}");
        }
    }

    #[test]
    fn fft_of_an_impulse_is_flat() {
        let (mut re, mut im) = (vec![0.0; 16], vec![0.0; 16]);
        re[0] = 1.0;
        fft(&mut re, &mut im);
        assert!(re.iter().all(|x| (x - 1.0).abs() < 1e-6) && im.iter().all(|x| x.abs() < 1e-6));
    }

    #[test]
    fn bands_are_log_spaced_and_stay_inside_the_spectrum() {
        let edges = band_edges(RATE);
        assert!((edges[0] - 40.0 * 1024.0 / 48_000.0).abs() < 1e-3);
        assert!((edges[BANDS] - 16_000.0 * 1024.0 / 48_000.0).abs() < 0.1);
        assert!(edges.windows(2).all(|w| w[1] > w[0]));
        assert!((edges[2] / edges[1] - edges[1] / edges[0]).abs() < 1e-3);
        assert!(band_edges(8_000)[BANDS] <= (SIZE / 2) as f32);
    }

    #[test]
    fn band_power_sums_wide_bands_and_interpolates_narrow_ones() {
        let power = [0.0, 1.0, 3.0, 5.0, 7.0, 9.0];
        assert_eq!(band_power(&power, 2.0, 5.0), 15.0);
        assert_eq!(band_power(&power, 1.25, 1.75), 2.0); // halfway between bins 1 and 2
        assert_eq!(band_power(&power, 5.25, 5.75), 4.5); // past the end reads as silence
        assert_eq!(band_power(&power, 4.0, 40.0), 16.0);
    }

    #[test]
    fn level_maps_decibels_onto_zero_to_one() {
        assert_eq!(level(0.0), 0.0);
        assert_eq!(level(1.0), 1.0);
        assert!((level(1e-4) - 0.5).abs() < 1e-5); // -40 dB sits halfway between the floor and the top
        assert_eq!(level(f32::NAN), 0.0);
    }

    #[test]
    fn bars_jump_up_and_fall_back_gradually() {
        assert_eq!(settle(0.2, 0.9), 0.9);
        assert_eq!(settle(1.0, 0.0), 0.8);
        let rested = (0..40).fold(1.0, |shown, _| settle(shown, 0.0));
        assert!(rested < 0.001, "{rested}"); // all the way down, not stuck a notch above zero
    }

    #[test]
    fn a_tone_lights_its_own_band() {
        let mut tap = Tap::new(RATE);
        for hz in [100.0, 1000.0, 8000.0] {
            tap.write(0, &sine(hz, 0.05, 4096)); // quiet enough that no band is pinned at 1
            let bands = tap.read(4096);
            let loudest = (0..BANDS).max_by(|a, b| bands[*a].total_cmp(&bands[*b])).unwrap();
            assert!(loudest.abs_diff(band_of(hz)) <= 1, "{hz} Hz lit band {loudest}");
            assert!(bands[loudest] > 0.6 && bands.iter().all(|b| (0.0..=1.0).contains(b)), "{bands:?}");
        }
    }

    #[test]
    fn silence_is_flat_and_the_window_follows_the_played_position() {
        let mut tap = Tap::new(RATE);
        assert_eq!(tap.read(10), [0.0; BANDS]);
        tap.write(HISTORY as u64 - 512, &sine(1000.0, 0.5, 2048)); // wraps around the history
        assert_eq!(tap.read(HISTORY as u64 - 512), [0.0; BANDS]); // nothing of it played yet
        assert!(tap.read(HISTORY as u64 + 1536)[band_of(1000.0)] > 0.8);
        let after = tap.read(HISTORY as u64 - 512); // back on silence: the bar is on its way down
        assert!(after[band_of(1000.0)] > 0.5 && after[band_of(1000.0)] < 0.85, "{after:?}");
    }
}
