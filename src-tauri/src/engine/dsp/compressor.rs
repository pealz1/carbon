//! Gentle dynamic-range compressor: loud passages come down, quiet ones come up a little. One
//! "amount" control sets threshold, ratio and make-up gain together. Runs inside the audio
//! callback, so it only does arithmetic on its own fields.
use super::db_to_gain;

/// Threshold at full amount; it rises to 0 dBFS as the amount falls to nothing.
const MAX_THRESHOLD_DB: f32 = -24.0;
/// Ratio is 1 + this × amount, so 4:1 at full amount.
const MAX_EXTRA_RATIO: f32 = 3.0;
/// The curve bends over this range around the threshold instead of at a corner.
const KNEE_DB: f32 = 6.0;
/// Share of a full-scale signal's reduction that make-up gain gives back.
const MAKEUP_SHARE: f32 = 0.5;
const ATTACK_SECONDS: f32 = 0.01;
const RELEASE_SECONDS: f32 = 0.25;
/// -120 dBFS, so silence has a level instead of minus infinity.
const QUIETEST: f32 = 1e-6;
/// +60 dBFS: nothing real is hotter, and capping here keeps the gain finite whatever comes in.
const LOUDEST: f32 = 1e3;
/// Close enough to unity to switch a disabled compressor fully out of the path.
const SETTLED_DB: f32 = 0.01;

#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Curve {
    pub threshold_db: f32,
    /// 1 − 1/ratio: the share of every dB over the threshold that is taken away.
    pub slope: f32,
    pub makeup_db: f32,
}

impl Curve {
    /// `amount` runs from 0 (does nothing) to 1 (-24 dB threshold, 4:1).
    pub fn for_amount(amount: f32) -> Curve {
        let amount = if amount.is_finite() { amount.clamp(0.0, 1.0) } else { 0.0 };
        let ratio = 1.0 + MAX_EXTRA_RATIO * amount;
        let bare = Curve { threshold_db: MAX_THRESHOLD_DB * amount, slope: 1.0 - 1.0 / ratio, makeup_db: 0.0 };
        Curve { makeup_db: bare.reduction_db(0.0) * MAKEUP_SHARE, ..bare }
    }

    /// dB taken off a signal at `level_db`.
    pub fn reduction_db(&self, level_db: f32) -> f32 {
        let over = level_db - self.threshold_db;
        if over <= -KNEE_DB / 2.0 {
            0.0
        } else if over < KNEE_DB / 2.0 {
            self.slope * (over + KNEE_DB / 2.0).powi(2) / (2.0 * KNEE_DB)
        } else {
            self.slope * over
        }
    }
}

pub struct Compressor {
    curve: Curve,
    active: bool,
    gain_db: f32,
    attack: f32,
    release: f32,
}

impl Compressor {
    pub fn new(sample_rate: f32) -> Compressor {
        let step = |seconds: f32| 1.0 - (-1.0 / (seconds * sample_rate)).exp();
        Compressor { curve: Curve::for_amount(0.0), active: false, gain_db: 0.0, attack: step(ATTACK_SECONDS), release: step(RELEASE_SECONDS) }
    }

    /// 0 switches it off; the gain then glides back to unity rather than jumping.
    pub fn set(&mut self, amount: f32) {
        self.curve = Curve::for_amount(amount);
        self.active = self.curve.slope > 0.0;
    }

    /// Stereo-linked, like the limiter, so the image doesn't shift.
    #[inline]
    pub fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        if !self.active && self.gain_db == 0.0 {
            return (l, r);
        }
        let peak = l.abs().max(r.abs());
        // A broken sample (NaN, infinity) counts as the loudest there is, so it can't poison the gain.
        let level_db = 20.0 * if peak.is_finite() { peak.clamp(QUIETEST, LOUDEST) } else { LOUDEST }.log10();
        let target = self.curve.makeup_db - self.curve.reduction_db(level_db);
        let step = if target < self.gain_db { self.attack } else { self.release };
        self.gain_db += (target - self.gain_db) * step;
        if !self.active && self.gain_db.abs() < SETTLED_DB {
            self.gain_db = 0.0;
        }
        let gain = db_to_gain(self.gain_db);
        (l * gain, r * gain)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: f32 = 48_000.0;

    /// Peak of the last 100 ms of a one-second sine at `amplitude` through `c`.
    fn settled_peak(c: &mut Compressor, amplitude: f32) -> f32 {
        let out = (0..48_000).map(|n| c.process(amplitude * (n as f32 * 0.05).sin(), 0.0).0.abs());
        out.skip(43_200).fold(0.0, f32::max)
    }

    #[test]
    fn amount_maps_to_threshold_ratio_and_makeup() {
        let off = Curve::for_amount(0.0);
        assert_eq!((off.threshold_db, off.slope, off.makeup_db), (0.0, 0.0, 0.0));
        let full = Curve::for_amount(1.0);
        assert_eq!((full.threshold_db, full.slope), (-24.0, 0.75));
        assert!((full.makeup_db - 9.0).abs() < 1e-4); // half of the 18 dB a full-scale signal loses
        assert_eq!(Curve::for_amount(7.0), full);
        assert_eq!(Curve::for_amount(f32::NAN), off);
    }

    #[test]
    fn reduction_starts_at_the_knee_and_follows_the_ratio() {
        let c = Curve::for_amount(1.0);
        assert_eq!(c.reduction_db(-40.0), 0.0);
        assert_eq!(c.reduction_db(-27.0), 0.0);
        assert!((c.reduction_db(-12.0) - 9.0).abs() < 1e-4); // 12 dB over at 4:1 keeps 3
        // The knee meets both straight parts without a step.
        assert!((c.reduction_db(-21.0) - 0.75 * 3.0).abs() < 1e-4);
        assert!(c.reduction_db(-24.0) > 0.0 && c.reduction_db(-24.0) < 0.75 * 3.0);
    }

    #[test]
    fn off_is_bit_exact() {
        let mut c = Compressor::new(RATE);
        for n in 0..1000 {
            let x = (n as f32 * 0.1).sin();
            assert_eq!(c.process(x, -x), (x, -x));
        }
    }

    #[test]
    fn narrows_the_gap_between_loud_and_quiet() {
        let mut c = Compressor::new(RATE);
        c.set(1.0);
        let loud = settled_peak(&mut c, 1.0);
        let quiet = settled_peak(&mut c, 0.01);
        assert!(loud < 0.6, "loud {loud}");
        assert!(quiet > 0.02, "quiet {quiet}"); // below the threshold: only make-up gain applies
        assert!(loud / quiet < 50.0, "still {}:1", loud / quiet);
    }

    #[test]
    fn switching_off_glides_back_to_untouched_audio() {
        let mut c = Compressor::new(RATE);
        c.set(0.5);
        settled_peak(&mut c, 0.8);
        c.set(0.0);
        let (first, _) = c.process(0.5, 0.5);
        assert_ne!(first, 0.5); // no jump on the sample the switch is flipped
        settled_peak(&mut c, 0.8);
        settled_peak(&mut c, 0.8);
        assert_eq!(c.process(0.5, 0.5), (0.5, 0.5));
    }

    #[test]
    fn bad_samples_do_not_poison_the_gain() {
        let mut c = Compressor::new(RATE);
        c.set(1.0);
        c.process(f32::NAN, f32::INFINITY);
        c.process(f32::NAN, f32::NAN);
        let (l, _) = c.process(0.1, 0.1);
        assert!(l.is_finite() && l != 0.0);
    }
}
