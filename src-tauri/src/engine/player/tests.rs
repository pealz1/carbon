use super::*;
use crate::engine::decoder::tests::temp_wav;
use crate::engine::dsp::{Params, Snapshot};
use crate::engine::queue::Clip;
use crate::engine::source::tests::{clipped, ramp_wav};
use std::sync::Mutex;
use std::sync::mpsc;

#[derive(Default)]
struct Recorded {
    errors: Mutex<Vec<String>>,
}

impl Events for Arc<Recorded> {
    fn state(&self, _: &EngineState) {}
    fn error(&self, message: &str) {
        self.errors.lock().unwrap().push(message.into());
    }
    fn spectrum(&self, _: &[f32]) {}
}

fn player(sound: SoundSettings) -> (Player<Arc<Recorded>>, Arc<Recorded>) {
    let events = Arc::new(Recorded::default());
    let shared = Arc::new(Shared::new(Params::new(Snapshot::default())));
    let (analyzer, _) = mpsc::channel();
    (Player::new(events.clone(), shared, sound, analyzer), events)
}

fn queue_of(paths: &[std::path::PathBuf]) -> Queue {
    let track = |(i, path): (usize, &std::path::PathBuf)| QueueTrack {
        id: i.to_string(),
        path: path.clone(),
        title: i.to_string(),
        replay_gain_db: None,
        replay_peak: None,
        album_gain_db: None,
        album_peak: None,
        clip: Clip::default(),
    };
    Queue::new(paths.iter().enumerate().map(track).collect(), 0, Repeat::Off)
}

/// Without an output device a track used to drop to idle, where play did nothing.
#[test]
fn a_track_with_no_device_waits_paused_and_keeps_its_place() {
    let path = temp_wav("player-park", 8_000, 2, 1.0);
    let (mut p, _) = player(SoundSettings::default());
    p.queue = queue_of(&[std::path::PathBuf::from("Z:/nope/missing.flac"), path.clone()]);
    p.park(0, 400);
    let state = p.state();
    assert_eq!((state.status, state.index, state.track_id.as_deref()), (Status::Paused, Some(1), Some("1")));
    assert_eq!((state.position_ms, state.duration_ms, state.rate), (400, 1000, 1.0));
    assert_eq!(p.playing(), Some((1, 400))); // what resume() retries with
    assert!(p.output.is_none() && p.current.is_none());
    p.publish_in_use(); // paused on it: its tags must not be rewritten underneath
    assert_eq!(*p.in_use().lock().unwrap(), vec![path.clone()]);
    let _ = std::fs::remove_file(path);
}

/// Three tracks of one CUE sheet, then another file: the sheet's tracks run on as one stream
/// (same open file, positions restarting at each track), and only the other file is opened.
#[test]
fn cue_tracks_of_one_file_play_on_without_reopening_it() {
    let album = ramp_wav("player-cue", 8_000, 24_000);
    let single = temp_wav("player-cue-single", 8_000, 2, 0.5);
    let (mut p, events) = player(SoundSettings::default());
    let whole = QueueTrack { id: "single".into(), ..clipped(single.clone(), "", 0, None) };
    let tracks = vec![clipped(album.clone(), "a", 0, Some(1000)), clipped(album.clone(), "b", 1000, Some(2000)), clipped(album.clone(), "c", 2000, None), whole];
    p.queue = Queue::new(tracks, 0, Repeat::Off);
    assert!(p.follows(0, 1) && p.follows(1, 2));
    assert!(!p.follows(0, 2) && !p.follows(1, 1) && !p.follows(2, 3) && !p.follows(3, 0));

    let first = p.open(0).unwrap();
    p.timeline.reset(FALLBACK_RATE, 1.0, segment(&first, 0));
    p.current = Some(first);
    std::fs::rename(&album, album.with_extension("moved")).ok(); // a reopen would now fail (where the OS allows the rename)
    let second = u64::from(FALLBACK_RATE);
    assert_eq!(p.produce(60_000), 60_000);
    assert_eq!((p.queue.index(), p.current.as_ref().map(|s| (s.id.as_str(), s.duration_ms))), (1, Some(("b", 1000))));
    assert_eq!(p.timeline.at(second - 1).map(|(s, pos)| (s.index, pos)), Some((0, 1000)));
    assert_eq!(p.timeline.at(second + second / 4).map(|(s, pos)| (s.id.clone(), pos, s.duration_ms)), Some(("b".into(), 250, 1000)));
    p.produced = 60_000;
    assert_eq!(p.produce(100_000), 100_000);
    assert_eq!(p.current.as_ref().map(|s| s.id.as_str()), Some("single")); // past "c" and into the next file
    assert_eq!(p.timeline.at(2 * second + 4_800).map(|(s, pos)| (s.id.clone(), pos)), Some(("c".into(), 100)));
    assert_eq!(p.timeline.at(3 * second + 4_800).map(|(s, pos)| (s.id.clone(), pos)), Some(("single".into(), 100)));
    assert!(events.errors.lock().unwrap().is_empty(), "{:?}", events.errors.lock().unwrap());
    let _ = std::fs::remove_file(album.with_extension("moved"));
    let _ = std::fs::remove_file(album);
    let _ = std::fs::remove_file(single);
}

#[test]
fn speed_is_reported_and_an_unchanged_speed_does_nothing() {
    let (mut p, events) = player(SoundSettings::default());
    p.set_speed(1.0);
    p.set_speed(1.5); // nothing is playing, so there is nothing to restart
    assert_eq!(p.state().rate, 1.5);
    assert_eq!(p.status, Status::Idle);
    assert!(events.errors.lock().unwrap().is_empty());
}

#[test]
fn tags_win_over_measuring_until_they_are_switched_off() {
    let (mut p, _) = player(SoundSettings::default());
    let tagged = QueueTrack { replay_gain_db: Some(-5.0), ..queue_of(&["a.flac".into()]).get(0).cloned().unwrap() };
    assert_eq!(p.gain_for(&tagged), -5.0);
    assert!(p.requested.is_empty());
    p.sound.tag_gain = crate::engine::sound::TagGain::Off;
    assert_eq!(p.gain_for(&tagged), 0.0); // until Carbon's own measurement arrives
    assert!(p.requested.contains("0"));
    p.gains.insert("0".into(), -3.5);
    assert_eq!(p.gain_for(&tagged), -3.5);
}

#[test]
fn skipping_silence_scans_each_file_once() {
    let path = crate::engine::silence::tests::wav_with_silence("player-span", 4.0, &[(0.0, 1.5)]);
    let (mut p, _) = player(SoundSettings { skip_silence: true, ..SoundSettings::default() });
    p.queue = queue_of(std::slice::from_ref(&path));
    let source = p.open(0).unwrap();
    let lead_ms = segment(&source, 0).offset_ms; // the timeline starts where the sound does
    assert!(lead_ms.abs_diff(1400) <= 1, "{lead_ms}");
    drop(source);
    std::fs::remove_file(&path).unwrap();
    assert_eq!(p.span_for(&p.queue.get(0).cloned().unwrap()).lead_ms, lead_ms); // remembered, not read again
}
