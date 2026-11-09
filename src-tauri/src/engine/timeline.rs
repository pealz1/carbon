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
}

impl Timeline {
    pub fn reset(&mut self, rate: u32, first: Segment) {
        self.rate = rate.max(1);
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
        let elapsed = played.saturating_sub(seg.start) * 1000 / u64::from(self.rate);
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
        t.reset(1000, seg(0, 0, 0));
        t.push(seg(5000, 1, 0)); // decoded ahead, not heard yet
        let (s, pos) = t.at(2500).map(|(s, p)| (s.index, p)).unwrap();
        assert_eq!((s, pos), (0, 2500));
        let (s, pos) = t.at(6000).map(|(s, p)| (s.index, p)).unwrap();
        assert_eq!((s, pos), (1, 1000));
    }

    #[test]
    fn seek_offsets_and_duration_clamp() {
        let mut t = Timeline::default();
        t.reset(48_000, seg(96_000, 3, 9_000));
        assert_eq!(t.at(96_000).map(|(_, p)| p), Some(9_000));
        assert_eq!(t.at(96_000 + 48_000 * 5).map(|(_, p)| p), Some(10_000));
        assert_eq!(t.at(0).map(|(_, p)| p), Some(9_000));
    }

    #[test]
    fn empty_timeline_has_no_position() {
        assert!(Timeline::default().at(10).is_none());
    }
}
