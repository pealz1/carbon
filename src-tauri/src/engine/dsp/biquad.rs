//! RBJ "Audio EQ Cookbook" biquads. Shelves use slope S = 1 and peaks use Q, the same formulas as
//! Web Audio's BiquadFilterNode, so the local engine and the Spotify experiment sound alike.
use std::f64::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shape {
    Peaking,
    LowShelf,
    HighShelf,
}

/// Normalised coefficients (a0 = 1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Coeffs {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}

impl Coeffs {
    pub const IDENTITY: Coeffs = Coeffs { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0 };

    pub fn new(shape: Shape, freq: f64, q: f64, gain_db: f64, sample_rate: f64) -> Coeffs {
        // Keep the centre safely below Nyquist (a 16 kHz band at a 32 kHz device rate).
        let freq = freq.clamp(1.0, sample_rate * 0.45);
        let a = 10f64.powf(gain_db / 40.0);
        let w0 = 2.0 * PI * freq / sample_rate;
        let (sin, cos) = w0.sin_cos();
        let (b0, b1, b2, a0, a1, a2) = match shape {
            Shape::Peaking => {
                let alpha = sin / (2.0 * q);
                (1.0 + alpha * a, -2.0 * cos, 1.0 - alpha * a, 1.0 + alpha / a, -2.0 * cos, 1.0 - alpha / a)
            }
            Shape::LowShelf | Shape::HighShelf => {
                let k = 2.0 * a.sqrt() * (sin / 2.0 * 2f64.sqrt()); // 2·√A·α with S = 1
                let (ap, am) = (a + 1.0, a - 1.0);
                if shape == Shape::LowShelf {
                    (
                        a * (ap - am * cos + k),
                        2.0 * a * (am - ap * cos),
                        a * (ap - am * cos - k),
                        ap + am * cos + k,
                        -2.0 * (am + ap * cos),
                        ap + am * cos - k,
                    )
                } else {
                    (
                        a * (ap + am * cos + k),
                        -2.0 * a * (am + ap * cos),
                        a * (ap + am * cos - k),
                        ap - am * cos + k,
                        2.0 * (am - ap * cos),
                        ap - am * cos - k,
                    )
                }
            }
        };
        Coeffs { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
    }

    /// Gain in dB of this filter at `freq`, from |H(e^jw)|.
    pub fn magnitude_db(&self, freq: f64, sample_rate: f64) -> f64 {
        let w = 2.0 * PI * freq / sample_rate;
        let (s1, c1) = w.sin_cos();
        let (s2, c2) = (2.0 * w).sin_cos();
        let (nr, ni) = (self.b0 + self.b1 * c1 + self.b2 * c2, -(self.b1 * s1 + self.b2 * s2));
        let (dr, di) = (1.0 + self.a1 * c1 + self.a2 * c2, -(self.a1 * s1 + self.a2 * s2));
        10.0 * ((nr * nr + ni * ni) / (dr * dr + di * di)).log10()
    }
}

/// One channel of a biquad in transposed direct form II. f64 state keeps 31 Hz stable.
#[derive(Clone, Copy, Debug)]
pub struct Biquad {
    c: Coeffs,
    z1: f64,
    z2: f64,
}

impl Default for Biquad {
    fn default() -> Self {
        Biquad { c: Coeffs::IDENTITY, z1: 0.0, z2: 0.0 }
    }
}

impl Biquad {
    pub fn set(&mut self, c: Coeffs) {
        self.c = c;
    }

    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }

    #[inline]
    pub fn process(&mut self, x: f64) -> f64 {
        let c = &self.c;
        let y = c.b0 * x + self.z1;
        self.z1 = c.b1 * x - c.a1 * y + self.z2;
        self.z2 = c.b2 * x - c.a2 * y;
        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FS: f64 = 48_000.0;

    fn close(a: f64, b: f64, tol: f64) -> bool {
        (a - b).abs() <= tol
    }

    #[test]
    fn peaking_hits_its_gain_at_the_centre_and_is_flat_far_away() {
        let c = Coeffs::new(Shape::Peaking, 1000.0, std::f64::consts::SQRT_2, 6.0, FS);
        assert!(close(c.magnitude_db(1000.0, FS), 6.0, 1e-6));
        assert!(close(c.magnitude_db(20.0, FS), 0.0, 0.05));
        assert!(close(c.magnitude_db(20_000.0, FS), 0.0, 0.1));
    }

    #[test]
    fn shelves_reach_full_gain_on_their_side() {
        let low = Coeffs::new(Shape::LowShelf, 100.0, 1.0, 9.0, FS);
        assert!(close(low.magnitude_db(10.0, FS), 9.0, 0.1));
        assert!(close(low.magnitude_db(100.0, FS), 4.5, 0.05)); // half gain at the corner
        assert!(close(low.magnitude_db(10_000.0, FS), 0.0, 0.05));
        let high = Coeffs::new(Shape::HighShelf, 8000.0, 1.0, -6.0, FS);
        assert!(close(high.magnitude_db(23_000.0, FS), -6.0, 0.2));
        assert!(close(high.magnitude_db(100.0, FS), 0.0, 0.05));
    }

    #[test]
    fn zero_gain_is_transparent() {
        for shape in [Shape::Peaking, Shape::LowShelf, Shape::HighShelf] {
            let c = Coeffs::new(shape, 250.0, 1.4, 0.0, FS);
            for f in [30.0, 250.0, 5000.0] {
                assert!(close(c.magnitude_db(f, FS), 0.0, 1e-9));
            }
        }
    }

    #[test]
    fn filtering_a_sine_matches_the_predicted_gain() {
        let c = Coeffs::new(Shape::Peaking, 1000.0, 1.4, -9.0, FS);
        let mut f = Biquad::default();
        f.set(c);
        let mut peak: f64 = 0.0;
        for n in 0..48_000 {
            let y = f.process((2.0 * PI * 1000.0 * n as f64 / FS).sin());
            if n > 24_000 {
                peak = peak.max(y.abs());
            }
        }
        assert!(close(20.0 * peak.log10(), -9.0, 0.05));
    }

    #[test]
    fn clamps_bands_above_nyquist() {
        let c = Coeffs::new(Shape::HighShelf, 16_000.0, 1.0, 6.0, 32_000.0);
        assert!(c.magnitude_db(1000.0, 32_000.0).is_finite());
    }
}
