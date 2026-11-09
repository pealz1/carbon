//! Zero-latency peak limiter: the last stage before the device, so EQ boosts never clip.
//! Gain drops instantly to whatever keeps the peak under the ceiling, then recovers smoothly.

/// -1 dBFS: headroom for inter-sample peaks in the DAC's reconstruction filter.
pub const CEILING: f32 = 0.891_250_9;
const RELEASE_SECONDS: f32 = 0.15;

pub struct Limiter {
    gain: f32,
    release: f32,
}

impl Limiter {
    pub fn new(sample_rate: f32) -> Limiter {
        Limiter { gain: 1.0, release: (-1.0 / (RELEASE_SECONDS * sample_rate)).exp() }
    }

    /// Stereo-linked so the image doesn't shift while limiting.
    #[inline]
    pub fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let peak = l.abs().max(r.abs());
        let needed = if peak > CEILING { CEILING / peak } else { 1.0 };
        // Never above `needed`, so the output can't exceed the ceiling.
        self.gain = if needed < self.gain { needed } else { needed + (self.gain - needed) * self.release };
        (l * self.gain, r * self.gain)
    }

    #[cfg(test)]
    pub fn reduction(&self) -> f32 {
        self.gain
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn never_exceeds_the_ceiling() {
        let mut lim = Limiter::new(48_000.0);
        for n in 0..48_000 {
            let x = 3.0 * (n as f32 * 0.05).sin();
            let (l, r) = lim.process(x, -x * 0.5);
            assert!(l.abs() <= CEILING + 1e-6 && r.abs() <= CEILING + 1e-6);
        }
    }

    #[test]
    fn leaves_quiet_audio_untouched() {
        let mut lim = Limiter::new(48_000.0);
        for n in 0..1000 {
            let x = 0.5 * (n as f32 * 0.1).sin();
            assert_eq!(lim.process(x, x), (x, x));
        }
    }

    #[test]
    fn recovers_after_a_transient() {
        let mut lim = Limiter::new(48_000.0);
        lim.process(4.0, 4.0);
        assert!(lim.reduction() < 0.3);
        for _ in 0..48_000 {
            lim.process(0.1, 0.1);
        }
        assert!(lim.reduction() > 0.999);
    }
}
