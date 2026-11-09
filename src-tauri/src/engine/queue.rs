//! The engine's play queue: a run of local files plus repeat rules. Only local files ever
//! reach this queue, so crossfade and gapless can never touch a Spotify track.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum Repeat {
    #[default]
    Off,
    All,
    One,
}

#[derive(Clone, Debug, PartialEq)]
pub struct QueueTrack {
    pub id: String,
    pub path: PathBuf,
    pub title: String,
    /// ReplayGain track gain from tags, if any.
    pub replay_gain_db: Option<f32>,
    pub replay_peak: Option<f32>,
}

#[derive(Default, Debug)]
pub struct Queue {
    tracks: Vec<QueueTrack>,
    index: usize,
    pub repeat: Repeat,
}

impl Queue {
    pub fn new(tracks: Vec<QueueTrack>, index: usize, repeat: Repeat) -> Queue {
        let index = index.min(tracks.len().saturating_sub(1));
        Queue { tracks, index, repeat }
    }

    pub fn index(&self) -> usize {
        self.index
    }

    pub fn get(&self, index: usize) -> Option<&QueueTrack> {
        self.tracks.get(index)
    }

    /// What follows the current track. `ended` = it finished on its own (repeat-one loops then,
    /// but a "next" press still moves on).
    pub fn peek_next(&self, ended: bool) -> Option<usize> {
        if self.tracks.is_empty() {
            return None;
        }
        if ended && self.repeat == Repeat::One {
            return Some(self.index);
        }
        let next = self.index + 1;
        if next < self.tracks.len() {
            Some(next)
        } else if self.repeat == Repeat::Off {
            None
        } else {
            Some(0)
        }
    }

    pub fn jump(&mut self, index: usize) -> Option<&QueueTrack> {
        let track = self.tracks.get(index)?;
        self.index = index;
        Some(track)
    }

    pub fn len(&self) -> usize {
        self.tracks.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(id: &str) -> QueueTrack {
        QueueTrack { id: id.into(), path: PathBuf::from(id), title: id.into(), replay_gain_db: None, replay_peak: None }
    }

    fn queue(n: usize, index: usize, repeat: Repeat) -> Queue {
        Queue::new((0..n).map(|i| track(&i.to_string())).collect(), index, repeat)
    }

    #[test]
    fn plays_through_then_stops() {
        let q = queue(3, 1, Repeat::Off);
        assert_eq!(q.peek_next(true), Some(2));
        assert_eq!(queue(3, 2, Repeat::Off).peek_next(true), None);
    }

    #[test]
    fn repeat_all_wraps() {
        assert_eq!(queue(3, 2, Repeat::All).peek_next(true), Some(0));
    }

    #[test]
    fn repeat_one_loops_only_when_the_track_ends() {
        let q = queue(3, 1, Repeat::One);
        assert_eq!(q.peek_next(true), Some(1));
        assert_eq!(q.peek_next(false), Some(2));
    }

    #[test]
    fn clamps_the_start_index_and_handles_empty() {
        assert_eq!(queue(2, 9, Repeat::Off).index(), 1);
        let empty = queue(0, 0, Repeat::All);
        assert_eq!(empty.peek_next(true), None);
    }

    #[test]
    fn jump_only_moves_to_existing_tracks() {
        let mut q = queue(3, 0, Repeat::All);
        assert_eq!(q.jump(2).map(|t| t.id.clone()), Some("2".into()));
        assert!(q.jump(7).is_none());
        assert_eq!(q.index(), 2);
        assert_eq!(q.peek_next(true), Some(0));
    }
}
