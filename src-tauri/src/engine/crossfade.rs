//! Crossfades between consecutive local files. Equal-power curves keep perceived loudness
//! steady through the overlap (a linear fade dips by 3 dB in the middle).
use std::f32::consts::FRAC_PI_2;

pub const MAX_SECONDS: f32 = 12.0;

/// (outgoing, incoming) gains at progress `t` in 0..=1.
pub fn equal_power(t: f32) -> (f32, f32) {
    let angle = t.clamp(0.0, 1.0) * FRAC_PI_2;
    (angle.cos(), angle.sin())
}

/// Mixes interleaved stereo `incoming` into `out` (which holds the outgoing track), starting
/// `done` frames into a fade of `total` frames.
pub fn mix(out: &mut [f32], incoming: &[f32], done: u64, total: u64) {
    let total = total.max(1) as f32;
    for (i, (o, n)) in out.as_chunks_mut::<2>().0.iter_mut().zip(incoming.as_chunks::<2>().0).enumerate() {
        let (fade_out, fade_in) = equal_power((done + i as u64) as f32 / total);
        o[0] = o[0] * fade_out + n[0] * fade_in;
        o[1] = o[1] * fade_out + n[1] * fade_in;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curves_start_and_end_cleanly() {
        let (o, i) = equal_power(0.0);
        assert!((o - 1.0).abs() < 1e-6 && i.abs() < 1e-6);
        let (o, i) = equal_power(1.0);
        assert!(o.abs() < 1e-6 && (i - 1.0).abs() < 1e-6);
        assert_eq!(equal_power(-1.0), equal_power(0.0));
    }

    #[test]
    fn power_stays_constant_through_the_fade() {
        for step in 0..=100 {
            let (o, i) = equal_power(step as f32 / 100.0);
            assert!((o * o + i * i - 1.0).abs() < 1e-5);
        }
    }

    #[test]
    fn mixes_halfway_at_equal_power() {
        let mut out = vec![1.0, 1.0, 1.0, 1.0];
        mix(&mut out, &[1.0, 1.0, 1.0, 1.0], 50, 100);
        let expected = std::f32::consts::SQRT_2; // cos(45°) + sin(45°)
        assert!((out[0] - expected).abs() < 0.02);
    }
}
