//! The 10-band graphic EQ: band layout, presets and the response curve the Sound page draws.
use super::biquad::{Coeffs, Shape};
use serde::Serialize;

pub const BANDS: usize = 10;
pub const FREQUENCIES: [f64; BANDS] = [31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0];
/// About one octave wide, so neighbouring bands blend into a smooth curve.
pub const Q: f64 = std::f64::consts::SQRT_2;
pub const MAX_GAIN_DB: f32 = 12.0;
pub const CUSTOM: &str = "custom";
const CURVE_RATE: f64 = 48_000.0;
const CURVE_MIN_HZ: f64 = 20.0;
const CURVE_MAX_HZ: f64 = 20_000.0;

pub type Bands = [f32; BANDS];

pub fn shape(band: usize) -> Shape {
    match band {
        0 => Shape::LowShelf,
        b if b == BANDS - 1 => Shape::HighShelf,
        _ => Shape::Peaking,
    }
}

pub fn coeffs(band: usize, gain_db: f32, sample_rate: f64) -> Coeffs {
    if gain_db == 0.0 {
        return Coeffs::IDENTITY;
    }
    Coeffs::new(shape(band), FREQUENCIES[band], Q, f64::from(gain_db), sample_rate)
}

#[derive(Serialize, Clone, Copy, Debug)]
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    pub bands: Bands,
}

pub const PRESETS: [Preset; 9] = [
    Preset { id: "flat", name: "Flat", bands: [0.0; BANDS] },
    Preset { id: "bass", name: "Bass Boost", bands: [6.0, 5.0, 4.0, 2.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0] },
    Preset { id: "treble", name: "Treble Boost", bands: [0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 2.0, 4.0, 5.0, 6.0] },
    Preset { id: "vocal", name: "Vocal", bands: [-2.0, -2.0, -1.0, 0.0, 2.0, 3.5, 3.5, 2.0, 0.0, -1.0] },
    Preset { id: "rock", name: "Rock", bands: [4.0, 3.0, 2.0, 0.0, -1.0, -1.0, 0.0, 2.0, 3.0, 4.0] },
    Preset { id: "electronic", name: "Electronic", bands: [5.0, 4.0, 1.5, 0.0, -1.5, 1.0, 0.0, 1.5, 4.0, 5.0] },
    Preset { id: "acoustic", name: "Acoustic", bands: [3.0, 3.0, 2.0, 1.0, 1.5, 1.5, 2.5, 3.0, 2.5, 1.5] },
    Preset { id: "loudness", name: "Loudness", bands: [5.0, 4.0, 2.0, 0.0, -1.0, -1.0, 0.0, 1.0, 3.0, 4.0] },
    // Quiet listening: no rumble through the walls, a little presence so voices stay clear.
    Preset { id: "late-night", name: "Late Night", bands: [-6.0, -4.0, -2.0, 0.0, 1.0, 2.0, 2.0, 1.0, 0.0, -1.0] },
];

pub fn preset(id: &str) -> Option<&'static Preset> {
    PRESETS.iter().find(|p| p.id == id)
}

/// Total response in dB at `freq` for these bands plus preamp.
pub fn response_db(bands: &Bands, preamp_db: f32, freq: f64) -> f64 {
    let filters: f64 = (0..BANDS).map(|b| coeffs(b, bands[b], CURVE_RATE).magnitude_db(freq, CURVE_RATE)).sum();
    f64::from(preamp_db) + filters
}

/// `points` log-spaced samples of the response from 20 Hz to 20 kHz, for drawing.
pub fn curve(bands: &Bands, preamp_db: f32, points: usize) -> Vec<f32> {
    let span = (CURVE_MAX_HZ / CURVE_MIN_HZ).ln();
    let last = points.saturating_sub(1).max(1) as f64;
    (0..points)
        .map(|i| response_db(bands, preamp_db, CURVE_MIN_HZ * (span * i as f64 / last).exp()) as f32)
        .collect()
}

pub fn valid_gain(gain: f32) -> bool {
    gain.is_finite() && gain.abs() <= MAX_GAIN_DB
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flat_is_flat_everywhere() {
        assert!(curve(&[0.0; BANDS], 0.0, 64).iter().all(|db| db.abs() < 1e-6));
    }

    #[test]
    fn a_single_band_peaks_at_its_frequency() {
        let mut bands = [0.0; BANDS];
        bands[5] = 6.0;
        assert!((response_db(&bands, 0.0, 1000.0) - 6.0).abs() < 0.01);
        assert!(response_db(&bands, 0.0, 100.0).abs() < 0.3);
    }

    #[test]
    fn preamp_shifts_the_whole_curve() {
        let c = curve(&[0.0; BANDS], -3.0, 8);
        assert!(c.iter().all(|db| (db + 3.0).abs() < 1e-6));
    }

    #[test]
    fn presets_are_unique_and_within_range() {
        for (i, p) in PRESETS.iter().enumerate() {
            assert!(p.bands.iter().all(|g| valid_gain(*g)), "{} out of range", p.id);
            assert!(PRESETS[i + 1..].iter().all(|q| q.id != p.id));
        }
        assert_eq!(preset("bass").map(|p| p.name), Some("Bass Boost"));
        assert!(preset(CUSTOM).is_none());
    }

    #[test]
    fn bass_boost_lifts_lows_not_highs() {
        let bass = preset("bass").unwrap().bands;
        assert!(response_db(&bass, 0.0, 60.0) > 5.0);
        assert!(response_db(&bass, 0.0, 10_000.0).abs() < 0.5);
    }

    #[test]
    fn rejects_out_of_range_gain() {
        assert!(!valid_gain(12.5));
        assert!(!valid_gain(f32::NAN));
        assert!(valid_gain(-12.0));
    }
}
