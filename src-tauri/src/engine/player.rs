//! The decode thread: owns the queue, the open files and the output device. It turns commands
//! into a continuous stream (gapless, or crossfaded between local files) and pushes it into the
//! ring the audio callback drains. Everything slow (file IO, resampling, device setup) lives here.
use super::crossfade;
use super::loudness::{self, Request};
use super::output::{self, Output, Shared};
use super::queue::{Queue, QueueTrack, Repeat};
use super::silence::{self, Span};
use super::sound::SoundSettings;
use super::source::Source;
use super::spectrum::{self, Tap};
use super::timeline::{Segment, Timeline};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::sync::atomic::Ordering;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant};
use tokio::sync::oneshot;

const MIN_WRITE_FRAMES: usize = 512;
const MAX_WRITE_FRAMES: usize = 4096;
const EMIT_EVERY: Duration = Duration::from_millis(500);
const DEVICE_CHECK_EVERY: Duration = Duration::from_secs(2);
/// Let go of the device after a short pause so Windows can sleep and other apps get exclusive mode.
const RELEASE_AFTER_PAUSE: Duration = Duration::from_secs(2);
const FLUSH_TIMEOUT: Duration = Duration::from_millis(300);
/// Long enough for the callback's pause ramp to reach silence before the device closes.
const STOP_FADE: Duration = Duration::from_millis(15);
/// Used for timing when no device is open to say its own rate.
const FALLBACK_RATE: u32 = 48_000;
const SPECTRUM_EVERY: Duration = Duration::from_millis(33);
/// The interface renews its request for the spectrum; one that isn't renewed (a reloaded or
/// crashed window) runs out instead of costing CPU for the rest of the session.
const SPECTRUM_LEASE: Duration = Duration::from_secs(5);

pub enum Command {
    /// `play_id` is echoed in every state so the webview can ignore states from older queues.
    Play { tracks: Vec<QueueTrack>, index: usize, repeat: Repeat, play_id: u32, start_ms: u64 },
    Pause,
    Resume,
    /// Replies once the device is silent and closed, so a Spotify hand-off can't overlap.
    Stop(oneshot::Sender<()>),
    Seek(u64),
    Repeat(Repeat),
    Volume(f32),
    Sound(Box<SoundSettings>),
    Loudness { id: String, gain_db: f32 },
    /// Playback speed, already checked to be 0.5 to 2. Pitch follows.
    Speed(f64),
    /// Start (or renew) or stop the visualizer's spectrum.
    Spectrum(bool),
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Idle,
    Playing,
    Paused,
    Ended,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EngineState {
    pub play_id: u32,
    pub status: Status,
    pub index: Option<usize>,
    pub track_id: Option<String>,
    /// Always the position in the track itself, whatever the speed.
    pub position_ms: u64,
    pub duration_ms: u64,
    /// Playback speed: `position_ms` advances this many milliseconds per millisecond played.
    pub rate: f64,
}

pub trait Events: Send + 'static {
    fn state(&self, state: &EngineState);
    fn error(&self, message: &str);
    fn spectrum(&self, bands: &[f32]);
}

/// Files the engine has open or is paused on. The tag editor leaves these alone.
pub type InUse = Arc<Mutex<Vec<PathBuf>>>;

pub struct Player<E: Events> {
    events: E,
    shared: Arc<Shared>,
    output: Option<Output>,
    queue: Queue,
    current: Option<Source>,
    incoming: Option<Source>,
    /// (frames done, total frames) of the running crossfade.
    fade: Option<(u64, u64)>,
    produced: u64,
    timeline: Timeline,
    status: Status,
    play_id: u32,
    sound: SoundSettings,
    volume: f32,
    speed: f64,
    gains: HashMap<String, f32>,
    requested: HashSet<String>,
    /// Where each file's sound starts and stops, found once per file when skip-silence is on.
    spans: HashMap<String, Span>,
    tap: Option<Tap>,
    spectrum_until: Instant,
    last_spectrum: Instant,
    /// The interface is showing bars that a frame of silence still has to bring down.
    spectrum_shown: bool,
    analyzer: Sender<Request>,
    scratch: Vec<f32>,
    incoming_buf: Vec<f32>,
    draining: bool,
    paused_at: Option<Instant>,
    last_emit: Instant,
    last_device_check: Instant,
    last_seen: Option<(Status, Option<usize>)>,
    in_use: InUse,
}

impl<E: Events> Player<E> {
    pub fn new(events: E, shared: Arc<Shared>, sound: SoundSettings, analyzer: Sender<Request>) -> Player<E> {
        Player {
            events,
            shared,
            output: None,
            queue: Queue::default(),
            current: None,
            incoming: None,
            fade: None,
            produced: 0,
            timeline: Timeline::default(),
            status: Status::Idle,
            play_id: 0,
            sound,
            volume: 1.0,
            speed: 1.0,
            gains: HashMap::new(),
            requested: HashSet::new(),
            spans: HashMap::new(),
            tap: None,
            spectrum_until: Instant::now(),
            last_spectrum: Instant::now(),
            spectrum_shown: false,
            analyzer,
            scratch: Vec::new(),
            incoming_buf: Vec::new(),
            draining: false,
            paused_at: None,
            last_emit: Instant::now(),
            last_device_check: Instant::now(),
            last_seen: None,
            in_use: InUse::default(),
        }
    }

    pub fn in_use(&self) -> InUse {
        self.in_use.clone()
    }

    pub fn run(mut self, commands: Receiver<Command>) {
        loop {
            let wait = if self.status == Status::Playing { Duration::from_millis(5) } else { Duration::from_millis(200) };
            match commands.recv_timeout(wait) {
                Ok(c) => self.handle(c),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
            while let Ok(c) = commands.try_recv() {
                self.handle(c);
            }
            self.check_device();
            if self.status == Status::Playing {
                self.fill();
                self.prefetch_span();
            }
            self.release_if_idle();
            self.report_spectrum();
            self.report(false);
            self.publish_in_use();
        }
    }

    fn publish_in_use(&mut self) {
        let audible = self.playing().map(|(index, _)| index);
        let open = [&self.current, &self.incoming].into_iter().flatten().map(|s| s.index);
        let paths: Vec<&Path> = open.chain(audible).filter_map(|i| self.queue.get(i)).map(|t| t.path.as_path()).collect();
        if let Ok(mut in_use) = self.in_use.lock()
            && !in_use.iter().map(PathBuf::as_path).eq(paths.iter().copied())
        {
            *in_use = paths.into_iter().map(Path::to_path_buf).collect();
        }
    }

    fn handle(&mut self, command: Command) {
        match command {
            Command::Play { tracks, index, repeat, play_id, start_ms } => {
                self.play_id = play_id;
                self.queue = Queue::new(tracks, index, repeat);
                self.start(self.queue.index(), start_ms, false);
            }
            Command::Pause => self.pause(),
            Command::Resume => self.resume(),
            Command::Stop(done) => {
                if self.status == Status::Playing && self.output.is_some() {
                    self.shared.paused.store(true, Ordering::Release);
                    std::thread::sleep(STOP_FADE);
                }
                self.stop(Status::Idle);
                let _ = done.send(());
            }
            Command::Seek(ms) => {
                if let Some(index) = self.playing().map(|(i, _)| i) {
                    self.start(index, ms, self.status == Status::Paused);
                }
            }
            Command::Repeat(r) => self.queue.repeat = r,
            Command::Volume(v) => {
                self.volume = v;
                self.shared.params.store(self.sound.dsp(v));
            }
            Command::Sound(s) => self.apply_sound(*s),
            Command::Loudness { id, gain_db } => {
                self.gains.insert(id.clone(), gain_db);
                if self.sound.normalize {
                    [&mut self.current, &mut self.incoming].into_iter().flatten().filter(|s| s.id == id).for_each(|s| s.set_gain_db(gain_db));
                }
            }
            Command::Speed(speed) => self.set_speed(speed),
            // Changes nothing the interface shows, so there is no state to report.
            Command::Spectrum(on) => return self.spectrum_until = Instant::now() + if on { SPECTRUM_LEASE } else { Duration::ZERO },
        }
        self.report(true);
    }

    /// The resampler ratio is fixed per open file, so a new speed restarts the track where it is.
    fn set_speed(&mut self, speed: f64) {
        if speed == self.speed {
            return;
        }
        let at = self.playing();
        self.speed = speed;
        if let Some((index, ms)) = at {
            self.start(index, ms, self.status == Status::Paused);
        }
    }

    fn apply_sound(&mut self, sound: SoundSettings) {
        let device_changed = sound.device != self.sound.device;
        let gain_changed = sound.normalize != self.sound.normalize || sound.tag_gain != self.sound.tag_gain;
        self.sound = sound;
        self.shared.params.store(self.sound.dsp(self.volume));
        if gain_changed {
            let ids: Vec<(usize, String)> = [&self.current, &self.incoming].into_iter().flatten().map(|s| (s.index, s.id.clone())).collect();
            for (index, id) in ids {
                let gain = self.queue.get(index).cloned().map_or(0.0, |t| self.gain_for(&t));
                [&mut self.current, &mut self.incoming].into_iter().flatten().filter(|s| s.id == id).for_each(|s| s.set_gain_db(gain));
            }
        }
        if device_changed && self.output.is_some() {
            self.rebuild();
        }
    }

    /// (queue index, position ms) of what's audible right now.
    fn playing(&mut self) -> Option<(usize, u64)> {
        let played = self.shared.consumed.load(Ordering::Acquire);
        self.timeline.at(played).map(|(s, pos)| (s.index, pos))
    }

    fn ensure_output(&mut self) -> Result<(), String> {
        if self.output.is_none() {
            self.shared.failed.store(false, Ordering::Release);
            self.output = Some(output::open(self.shared.clone(), &self.sound.device)?);
            self.produced = self.shared.consumed.load(Ordering::Acquire);
            self.tap = None; // the new device may run at another rate
        }
        Ok(())
    }

    /// Drops everything buffered. Waits for the callback to confirm; a callback that never
    /// answers means the device is gone, so the output is released and reopened.
    fn flush(&mut self) {
        if self.output.is_none() {
            return;
        }
        self.shared.flush.store(true, Ordering::Release);
        let deadline = Instant::now() + FLUSH_TIMEOUT;
        while self.shared.flush.load(Ordering::Acquire) {
            if Instant::now() > deadline {
                eprintln!("[engine] the audio device stopped responding; reopening it");
                self.output = None;
                self.shared.flush.store(false, Ordering::Release);
                break;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        self.produced = self.shared.consumed.load(Ordering::Acquire);
    }

    /// Starts `index` at `ms`, skipping files that won't open.
    fn start(&mut self, index: usize, ms: u64, paused: bool) {
        self.flush();
        self.incoming = None;
        self.fade = None;
        self.draining = false;
        if let Err(e) = self.ensure_output() {
            self.events.error(&e);
            return self.park(index, ms);
        }
        let Some(mut source) = self.open_playable(index) else { return self.stop(Status::Ended) };
        if ms > 0
            && let Err(e) = source.seek(ms)
        {
            eprintln!("[engine] couldn't seek to {ms} ms: {e}");
        }
        let rate = self.output.as_ref().map_or(FALLBACK_RATE, |o| o.rate);
        self.timeline.reset(rate, self.speed, segment(&source, self.produced));
        self.queue.jump(source.index);
        self.current = Some(source);
        self.status = if paused { Status::Paused } else { Status::Playing };
        self.shared.paused.store(paused, Ordering::Release);
        self.paused_at = paused.then(Instant::now);
        self.prefetch_loudness();
    }

    /// No device could be opened (the only headphones or HDMI output went away). Stays paused on
    /// this track instead of going idle, so pressing play tries the device again.
    fn park(&mut self, index: usize, ms: u64) {
        let Some(source) = self.open_playable(index) else { return self.stop(Status::Ended) };
        let at = self.shared.consumed.load(Ordering::Acquire);
        let parked = Segment { offset_ms: if ms > 0 { ms.min(source.duration_ms) } else { source.position_ms() }, ..segment(&source, at) };
        self.timeline.reset(FALLBACK_RATE, self.speed, parked);
        self.queue.jump(source.index);
        self.current = None;
        self.status = Status::Paused;
        self.shared.paused.store(true, Ordering::Release);
        self.paused_at = None;
    }

    fn open_playable(&mut self, mut index: usize) -> Option<Source> {
        for _ in 0..self.queue.len() {
            match self.open(index) {
                Ok(source) => return Some(source),
                Err(e) => {
                    self.events.error(&e);
                    self.queue.jump(index);
                    index = self.queue.peek_next(false)?;
                }
            }
        }
        None
    }

    fn open(&mut self, index: usize) -> Result<Source, String> {
        let track = self.queue.get(index).cloned().ok_or("That track isn't in the queue.")?;
        let rate = self.output.as_ref().map_or(FALLBACK_RATE, |o| o.rate);
        let gain = self.gain_for(&track);
        let mut source = Source::open(&track, index, rate, gain, self.speed)
            .map_err(|e| format!("Couldn't play \u{201c}{}\u{201d}: {e}. Skipping it.", track.title))?;
        // A CUE track's edges are the sheet's: silence there is the album's own pause.
        if self.sound.skip_silence
            && track.clip.is_whole()
            && let Err(e) = source.trim(self.span_for(&track))
        {
            eprintln!("[engine] couldn't skip the silence in {}: {e}", track.path.display());
        }
        Ok(source)
    }

    /// Scanned once per file: a seek reopens the file and shouldn't pay for the scan again.
    fn span_for(&mut self, track: &QueueTrack) -> Span {
        *self.spans.entry(track.id.clone()).or_insert_with(|| {
            silence::scan(&track.path).unwrap_or_else(|e| {
                eprintln!("[engine] couldn't look for silence in {}: {e}", track.path.display());
                Span::default()
            })
        })
    }

    /// Looks for the next file's silence now, while the ring is full, so the scan never lands on
    /// the gapless transition itself.
    fn prefetch_span(&mut self) {
        if !self.sound.skip_silence || self.current.is_none() {
            return;
        }
        let next = self.queue.peek_next(true).and_then(|i| self.queue.get(i));
        if let Some(track) = next.filter(|t| t.clip.is_whole() && !self.spans.contains_key(&t.id)).cloned() {
            self.span_for(&track);
        }
    }

    fn gain_for(&mut self, track: &QueueTrack) -> f32 {
        if !self.sound.normalize {
            return 0.0;
        }
        if let Some(gain) = loudness::tag_gain_db(track, self.sound.tag_gain) {
            return gain;
        }
        if let Some(gain) = self.gains.get(&track.id) {
            return *gain;
        }
        if self.requested.insert(track.id.clone()) {
            let _ = self.analyzer.send(Request { id: track.id.clone(), path: track.path.clone(), clip: track.clip });
        }
        0.0
    }

    /// Measures the next track while this one plays, so its gain is ready at the transition.
    fn prefetch_loudness(&mut self) {
        if let Some(track) = self.queue.peek_next(true).and_then(|i| self.queue.get(i).cloned()) {
            self.gain_for(&track);
        }
    }

    fn fill(&mut self) {
        loop {
            let Some(out) = self.output.as_ref() else { return };
            let free = out.producer.slots() / 2;
            if free < MIN_WRITE_FRAMES || self.draining {
                return;
            }
            let frames = free.min(MAX_WRITE_FRAMES);
            let written = self.produce(frames);
            let Some(out) = self.output.as_mut() else { return };
            if let Ok(mut chunk) = out.producer.write_chunk(written * 2) {
                let (a, b) = chunk.as_mut_slices();
                a.copy_from_slice(&self.scratch[..a.len()]);
                b.copy_from_slice(&self.scratch[a.len()..written * 2]);
                chunk.commit_all();
            }
            if let Some(tap) = self.tap.as_mut() {
                tap.write(self.produced, &self.scratch[..written * 2]);
            }
            self.produced += written as u64;
            if written < frames {
                return;
            }
        }
    }

    /// Renders up to `frames` frames into `scratch`, moving across track boundaries gaplessly.
    fn produce(&mut self, frames: usize) -> usize {
        self.scratch.resize(frames * 2, 0.0);
        let mut done = 0;
        while done < frames {
            self.maybe_begin_crossfade(done);
            let Some(current) = self.current.as_mut() else { break };
            let want = frames - done;
            let got = match current.read(&mut self.scratch[done * 2..frames * 2]) {
                Ok(n) => n,
                Err(e) => {
                    let message = format!("Couldn't keep playing \u{201c}{}\u{201d}: {e}. Skipping it.", current.title);
                    self.events.error(&message);
                    0
                }
            };
            self.mix_incoming(done, got);
            done += got;
            if got < want && !self.advance(done) {
                break;
            }
        }
        done
    }

    fn maybe_begin_crossfade(&mut self, at: usize) {
        let fade_frames = self.output.as_ref().map_or(0, |o| (self.sound.crossfade_secs * o.rate as f32) as u64);
        let Some(current) = self.current.as_ref() else { return };
        if fade_frames == 0 || self.incoming.is_some() {
            return;
        }
        let Some(remaining) = current.remaining_frames().filter(|r| *r > 0 && *r <= fade_frames) else { return };
        let Some(next) = self.queue.peek_next(true) else { return };
        // The next CUE track is this very recording carrying on: fading it over itself would smear it.
        if self.follows(current.index, next) {
            return;
        }
        if let Ok(source) = self.open(next) {
            self.timeline.push(segment(&source, self.produced + at as u64));
            self.incoming = Some(source);
            self.fade = Some((0, remaining));
        }
    }

    fn mix_incoming(&mut self, at: usize, frames: usize) {
        let (Some(incoming), Some((done, total))) = (self.incoming.as_mut(), self.fade) else { return };
        self.incoming_buf.resize(frames * 2, 0.0);
        let got = incoming.read(&mut self.incoming_buf).unwrap_or(0);
        self.incoming_buf[got * 2..].fill(0.0);
        crossfade::mix(&mut self.scratch[at * 2..(at + frames) * 2], &self.incoming_buf, done, total);
        self.fade = Some((done + frames as u64, total));
    }

    /// The current file ended at frame `at` of this chunk. Returns false at the end of the queue.
    fn advance(&mut self, at: usize) -> bool {
        if let Some(incoming) = self.incoming.take() {
            self.fade = None;
            self.queue.jump(incoming.index);
            self.current = Some(incoming);
            self.prefetch_loudness();
            return true;
        }
        let Some(next) = self.queue.peek_next(true) else {
            self.current = None;
            self.draining = true;
            return false;
        };
        if self.carry_on(next, at) {
            return true;
        }
        self.queue.jump(next);
        match self.open_playable(next) {
            Some(source) => {
                self.timeline.push(segment(&source, self.produced + at as u64));
                self.queue.jump(source.index);
                self.current = Some(source);
                self.prefetch_loudness();
                true
            }
            None => {
                self.current = None;
                self.draining = true;
                false
            }
        }
    }

    /// Whether queue entry `next` is the stretch of the same file right after entry `now`:
    /// consecutive tracks of a CUE sheet.
    fn follows(&self, now: usize, next: usize) -> bool {
        match (self.queue.get(now), self.queue.get(next)) {
            (Some(a), Some(b)) => a.path == b.path && a.clip.end_ms == Some(b.clip.start_ms),
            _ => false,
        }
    }

    /// Moves on to the next CUE track of the file that is playing without reopening it, so the
    /// join is as seamless as it is on the disc. False when `next` is anything else.
    fn carry_on(&mut self, next: usize, at: usize) -> bool {
        let ready = self.current.as_ref().is_some_and(|c| c.at_clip_end() && self.follows(c.index, next));
        let Some(track) = self.queue.get(next).filter(|_| ready).cloned() else { return false };
        let gain = self.gain_for(&track);
        let Some(current) = self.current.as_mut() else { return false };
        current.carry_on(&track, next, gain);
        self.timeline.push(segment(current, self.produced + at as u64));
        self.queue.jump(next);
        self.prefetch_loudness();
        true
    }

    fn pause(&mut self) {
        if self.status == Status::Playing {
            self.shared.paused.store(true, Ordering::Release);
            self.status = Status::Paused;
            self.paused_at = Some(Instant::now());
        }
    }

    fn resume(&mut self) {
        match self.status {
            // The device was released during a long pause: reopen it where we left off.
            Status::Paused if self.output.is_none() => {
                if let Some((index, ms)) = self.playing() {
                    self.start(index, ms, false);
                }
            }
            Status::Paused => {
                self.shared.paused.store(false, Ordering::Release);
                self.status = Status::Playing;
                self.paused_at = None;
            }
            Status::Ended if self.queue.len() > 0 => self.start(0, 0, false),
            _ => {}
        }
    }

    fn stop(&mut self, status: Status) {
        self.flush();
        self.output = None;
        self.current = None;
        self.incoming = None;
        self.fade = None;
        self.draining = false;
        self.timeline.clear();
        self.status = status;
    }

    /// Reopens the device (it changed or failed) and carries on from the audible position.
    fn rebuild(&mut self) {
        let at = self.playing();
        let paused = self.status == Status::Paused;
        self.output = None;
        if let Some((index, ms)) = at {
            self.start(index, ms, paused);
        }
    }

    fn check_device(&mut self) {
        let Some(out) = self.output.as_ref() else { return };
        let failed = self.shared.failed.load(Ordering::Acquire);
        let due = self.last_device_check.elapsed() >= DEVICE_CHECK_EVERY;
        if !failed && !due {
            return;
        }
        self.last_device_check = Instant::now();
        if failed || out.default_changed() {
            if failed {
                self.events.error("The audio device stopped working. Switching to the current default.");
            }
            self.rebuild();
        }
    }

    fn release_if_idle(&mut self) {
        let idle = self.paused_at.is_some_and(|t| t.elapsed() >= RELEASE_AFTER_PAUSE);
        if self.status == Status::Paused && idle && self.output.is_some() {
            // The timeline stays, so the paused position is still reported and resumable.
            if let Some(out) = self.output.as_ref() {
                out.pause_stream();
            }
            self.output = None;
            self.current = None;
            self.incoming = None;
            self.fade = None;
        }
        if self.draining && self.shared.consumed.load(Ordering::Acquire) >= self.produced {
            self.stop(Status::Ended);
            self.report(true);
        }
    }

    fn report(&mut self, force: bool) {
        let state = self.state();
        let key = (state.status, state.index);
        let changed = self.last_seen != Some(key);
        let tick = self.status == Status::Playing && self.last_emit.elapsed() >= EMIT_EVERY;
        if force || changed || tick {
            self.last_seen = Some(key);
            self.last_emit = Instant::now();
            self.events.state(&state);
        }
    }

    fn state(&mut self) -> EngineState {
        let played = self.shared.consumed.load(Ordering::Acquire);
        let seg = self.timeline.at(played).map(|(s, pos)| (s.index, s.id.clone(), pos, s.duration_ms));
        let (index, track_id, position_ms, duration_ms) = match seg {
            Some((i, id, pos, dur)) => (Some(i), Some(id), pos, dur),
            None => (None, None, 0, 0),
        };
        EngineState { play_id: self.play_id, status: self.status, index, track_id, position_ms, duration_ms, rate: self.speed }
    }

    /// About 30 spectra a second while the interface wants them and music is playing; one flat
    /// frame when it stops, so the bars fall instead of freezing.
    fn report_spectrum(&mut self) {
        let wanted = Instant::now() < self.spectrum_until;
        let rate = self.output.as_ref().map(|o| o.rate);
        match rate.filter(|_| wanted && self.status == Status::Playing) {
            Some(rate) if self.last_spectrum.elapsed() >= SPECTRUM_EVERY => {
                let tap = self.tap.get_or_insert_with(|| Tap::new(rate));
                self.last_spectrum = Instant::now();
                self.spectrum_shown = true;
                self.events.spectrum(&tap.read(self.shared.consumed.load(Ordering::Acquire)));
            }
            Some(_) => {}
            None => {
                if std::mem::take(&mut self.spectrum_shown) && wanted {
                    self.events.spectrum(&[0.0; spectrum::BANDS]);
                }
                if !wanted {
                    self.tap = None;
                }
            }
        }
    }
}

/// A segment that becomes audible at output frame `start`, from wherever `source` stands now
/// (after a seek, or after its opening silence when that is skipped).
fn segment(source: &Source, start: u64) -> Segment {
    Segment { start, index: source.index, id: source.id.clone(), offset_ms: source.position_ms(), duration_ms: source.duration_ms }
}

#[cfg(test)]
mod tests;
