//! The real-time DSP chain: preamp → 10-band EQ → stereo width → volume → limiter.
//! Runs inside the audio callback, so nothing here allocates, locks or blocks.
pub mod biquad;
pub mod eq;
pub mod limiter;

use biquad::Biquad;
use eq::{BANDS, Bands};
use limiter::Limiter;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

/// Volume glides over ~10 ms so slider moves never click.
const SMOOTH_SECONDS: f32 = 0.01;

#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Snapshot {
    pub preamp_db: f32,
    pub bands: Bands,
    /// 0 = mono, 1 = unchanged, 2 = extra wide.
    pub width: f32,
    pub volume: f32,
}

impl Default for Snapshot {
    fn default() -> Self {
        Snapshot { preamp_db: 0.0, bands: [0.0; BANDS], width: 1.0, volume: 1.0 }
    }
}

/// Lock-free parameter block shared with the audio callback: f32s stored as bits, plus a
/// generation counter so the callback only recomputes filters when something changed. A torn
/// read during an update is corrected on the very next callback because the generation moves last.
pub struct Params {
    preamp_db: AtomicU32,
    bands: [AtomicU32; BANDS],
    width: AtomicU32,
    volume: AtomicU32,
    generation: AtomicU64,
}

impl Params {
    pub fn new(s: Snapshot) -> Params {
        let p = Params {
            preamp_db: AtomicU32::new(0),
            bands: std::array::from_fn(|_| AtomicU32::new(0)),
            width: AtomicU32::new(0),
            volume: AtomicU32::new(0),
            generation: AtomicU64::new(0),
        };
        p.store(s);
        p
    }

    pub fn store(&self, s: Snapshot) {
        let put = |a: &AtomicU32, v: f32| a.store(v.to_bits(), Ordering::Relaxed);
        put(&self.preamp_db, s.preamp_db);
        self.bands.iter().zip(s.bands).for_each(|(a, v)| put(a, v));
        put(&self.width, s.width);
        put(&self.volume, s.volume);
        self.generation.fetch_add(1, Ordering::Release);
    }

    pub fn load(&self) -> Snapshot {
        let get = |a: &AtomicU32| f32::from_bits(a.load(Ordering::Relaxed));
        Snapshot {
            preamp_db: get(&self.preamp_db),
            bands: std::array::from_fn(|i| get(&self.bands[i])),
            width: get(&self.width),
            volume: get(&self.volume),
        }
    }

    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::Acquire)
    }
}

pub fn db_to_gain(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

pub struct Chain {
    rate: f64,
    filters: [[Biquad; 2]; BANDS],
    active: [bool; BANDS],
    preamp: f32,
    width: f32,
    volume: f32,
    volume_target: f32,
    smooth: f32,
    limiter: Limiter,
    seen: u64,
}

impl Chain {
    pub fn new(sample_rate: u32) -> Chain {
        let rate = f64::from(sample_rate);
        Chain {
            rate,
            filters: [[Biquad::default(); 2]; BANDS],
            active: [false; BANDS],
            preamp: 1.0,
            width: 1.0,
            volume: 0.0,
            volume_target: 1.0,
            smooth: 1.0 - (-1.0 / (SMOOTH_SECONDS * sample_rate as f32)).exp(),
            limiter: Limiter::new(sample_rate as f32),
            seen: u64::MAX,
        }
    }

    /// Picks up new parameters if the generation moved. Cheap enough to call every callback.
    #[inline]
    pub fn sync(&mut self, params: &Params) {
        let generation = params.generation();
        if generation != self.seen {
            self.seen = generation;
            self.set(&params.load());
        }
    }

    pub fn set(&mut self, s: &Snapshot) {
        for (band, gain) in s.bands.iter().enumerate() {
            let c = eq::coeffs(band, *gain, self.rate);
            self.filters[band].iter_mut().for_each(|f| f.set(c));
            self.active[band] = *gain != 0.0;
        }
        self.preamp = db_to_gain(s.preamp_db);
        self.width = s.width;
        self.volume_target = s.volume;
    }

    /// One stereo frame through the chain. `fade` is the pause ramp from the output stage.
    #[inline]
    pub fn frame(&mut self, l: f32, r: f32, fade: f32) -> (f32, f32) {
        let (mut l, mut r) = (f64::from(l * self.preamp), f64::from(r * self.preamp));
        for band in 0..BANDS {
            if self.active[band] {
                let [fl, fr] = &mut self.filters[band];
                l = fl.process(l);
                r = fr.process(r);
            }
        }
        let (l, r) = widen(l as f32, r as f32, self.width);
        self.volume += (self.volume_target - self.volume) * self.smooth;
        let g = self.volume * fade;
        let (l, r) = self.limiter.process(l * g, r * g);
        if l.is_finite() && r.is_finite() {
            (l, r)
        } else {
            self.filters.iter_mut().flatten().for_each(Biquad::reset);
            (0.0, 0.0)
        }
    }
}

/// Mid/side width: scales the side signal, leaving centred sound alone.
#[inline]
pub fn widen(l: f32, r: f32, width: f32) -> (f32, f32) {
    let mid = (l + r) * 0.5;
    let side = (l - r) * 0.5 * width;
    (mid + side, mid - side)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn width_one_is_identity_and_zero_is_mono() {
        let (l, r) = widen(0.8, -0.2, 1.0);
        assert!((l - 0.8).abs() < 1e-6 && (r + 0.2).abs() < 1e-6);
        let (l, r) = widen(0.8, -0.2, 0.0);
        assert!((l - 0.3).abs() < 1e-6 && (r - 0.3).abs() < 1e-6);
    }

    #[test]
    fn params_round_trip_and_bump_generation() {
        let mut s = Snapshot::default();
        s.bands[3] = -4.5;
        s.volume = 0.4;
        let p = Params::new(Snapshot::default());
        let before = p.generation();
        p.store(s);
        assert!(p.generation() > before);
        assert_eq!(p.load(), s);
    }

    #[test]
    fn flat_chain_passes_audio_through_once_volume_settles() {
        let mut chain = Chain::new(48_000);
        chain.set(&Snapshot::default());
        for _ in 0..48_000 {
            chain.frame(0.0, 0.0, 1.0);
        }
        let (l, r) = chain.frame(0.5, -0.25, 1.0);
        assert!((l - 0.5).abs() < 1e-4 && (r + 0.25).abs() < 1e-4);
    }

    #[test]
    fn hot_settings_still_never_clip() {
        let mut chain = Chain::new(48_000);
        chain.set(&Snapshot { preamp_db: 12.0, bands: [12.0; BANDS], width: 2.0, volume: 1.0 });
        for n in 0..48_000 {
            let x = (n as f32 * 0.03).sin();
            let (l, r) = chain.frame(x, -x, 1.0);
            assert!(l.abs() <= limiter::CEILING + 1e-6 && r.abs() <= limiter::CEILING + 1e-6);
        }
    }

    #[test]
    fn sync_only_applies_new_generations() {
        let params = Params::new(Snapshot { volume: 0.5, ..Snapshot::default() });
        let mut chain = Chain::new(48_000);
        chain.sync(&params);
        assert_eq!(chain.volume_target, 0.5);
        chain.volume_target = 0.9; // stale local change survives until params move again
        chain.sync(&params);
        assert_eq!(chain.volume_target, 0.9);
        params.store(Snapshot { volume: 0.2, ..Snapshot::default() });
        chain.sync(&params);
        assert_eq!(chain.volume_target, 0.2);
    }
}
