//! Maps "frames the device has played" back to "which track, at what position". The decode thread
//! runs ahead of the speakers by the ring buffer, so it records where each track starts in the
//! output stream and the UI follows what is actually audible.
use std::collections::VecDeque;

#[derive(Clone, Debug, PartialEq)]
pub struct Segment {
    /// Output frame where this track becomes audible.
    pub start: u64,
    pub index: usize,
    pub id: String,
    /// Track position at `start` (non-zero after a seek).
    pub offset_ms: u64,
    pub duration_ms: u64,
}

#[derive(Default)]
pub struct Timeline {
    segments: VecDeque<Segment>,
    rate: u32,
    /// Playback speed of everything queued here; a speed change starts a new timeline.
    speed: f64,
}

/// Track time covered by `frames` output frames. At 2× every second of output is two of the track.
pub fn track_ms(frames: u64, rate: u32, speed: f64) -> u64 {
    (frames as f64 * 1000.0 * speed / f64::from(rate.max(1))).round() as u64
}

/// Output frames needed to play `ms` of the track: the inverse of `track_ms`.
pub fn output_frames(ms: u64, rate: u32, speed: f64) -> u64 {
    (ms as f64 * f64::from(rate) / (1000.0 * speed)).round() as u64
}

impl Timeline {
    pub fn reset(&mut self, rate: u32, speed: f64, first: Segment) {
        self.rate = rate.max(1);
        self.speed = speed;
        self.segments.clear();
        self.segments.push_back(first);
    }

    pub fn push(&mut self, segment: Segment) {
        self.segments.push_back(segment);
    }

    pub fn clear(&mut self) {
        self.segments.clear();
    }

    /// The audible segment and the position within it, after `played` output frames.
    pub fn at(&mut self, played: u64) -> Option<(&Segment, u64)> {
        while self.segments.len() > 1 && self.segments[1].start <= played {
            self.segments.pop_front();
        }
        let seg = self.segments.front()?;
        let elapsed = track_ms(played.saturating_sub(seg.start), self.rate, self.speed);
        let position = seg.offset_ms + elapsed;
        Some((seg, if seg.duration_ms > 0 { position.min(seg.duration_ms) } else { position }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(start: u64, index: usize, offset_ms: u64) -> Segment {
        Segment { start, index, id: index.to_string(), offset_ms, duration_ms: 10_000 }
    }

    #[test]
    fn follows_the_audible_track_not_the_decoder() {
        let mut t = Timeline::default();
        t.reset(1000, 1.0, seg(0, 0, 0));
        t.push(seg(5000, 1, 0)); // decoded ahead, not heard yet
        let (s, pos) = t.at(2500).map(|(s, p)| (s.index, p)).unwrap();
        assert_eq!((s, pos), (0, 2500));
        let (s, pos) = t.at(6000).map(|(s, p)| (s.index, p)).unwrap();
        assert_eq!((s, pos), (1, 1000));
    }

    #[test]
    fn seek_offsets_and_duration_clamp() {
        let mut t = Timeline::default();
        t.reset(48_000, 1.0, seg(96_000, 3, 9_000));
        assert_eq!(t.at(96_000).map(|(_, p)| p), Some(9_000));
        assert_eq!(t.at(96_000 + 48_000 * 5).map(|(_, p)| p), Some(10_000));
        assert_eq!(t.at(0).map(|(_, p)| p), Some(9_000));
    }

    #[test]
    fn speed_scales_track_time_not_output_time() {
        assert_eq!(track_ms(48_000, 48_000, 1.0), 1000);
        assert_eq!(track_ms(48_000, 48_000, 2.0), 2000);
        assert_eq!(track_ms(48_000, 48_000, 0.5), 500);
        assert_eq!(track_ms(44_100, 44_100, 1.25), 1250);
        assert_eq!(output_frames(2000, 48_000, 2.0), 48_000);
        assert_eq!(output_frames(500, 48_000, 0.5), 48_000);
        for speed in [0.5, 0.85, 1.0, 1.35, 2.0] {
            let frames = output_frames(61_234, 44_100, speed);
            assert!(track_ms(frames, 44_100, speed).abs_diff(61_234) <= 1, "{speed}");
        }
    }

    #[test]
    fn positions_follow_the_track_at_any_speed() {
        let mut t = Timeline::default();
        t.reset(48_000, 1.5, seg(48_000, 0, 2_000));
        // One second of output after a seek to 0:02 at 1.5× is 0:03.5 of the track.
        assert_eq!(t.at(96_000).map(|(_, p)| p), Some(3_500));
        t.push(seg(96_000, 1, 0));
        assert_eq!(t.at(96_000 + 24_000).map(|(s, p)| (s.index, p)), Some((1, 750)));
    }

    #[test]
    fn empty_timeline_has_no_position() {
        assert!(Timeline::default().at(10).is_none());
    }
}
