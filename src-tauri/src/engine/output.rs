//! The audio device. The decode thread fills a lock-free ring; the cpal callback drains it through
//! the DSP chain. The callback never allocates, locks or blocks: it reads atomics, pops the ring
//! and writes zeros on underrun.
use super::dsp::{Chain, Params};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rtrb::{Consumer, Producer, RingBuffer};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

/// Enough slack for the decode thread to open the next file without an underrun.
const RING_SECONDS: f32 = 0.3;
/// Pause and resume ramp, so stopping mid-waveform doesn't click.
const FADE_SECONDS: f32 = 0.008;

pub struct Shared {
    pub params: Params,
    pub paused: AtomicBool,
    /// Set by the decode thread to drop buffered audio (seek, skip); cleared by the callback.
    pub flush: AtomicBool,
    /// Frames the callback has taken from the ring since the output opened.
    pub consumed: AtomicU64,
    pub failed: AtomicBool,
}

impl Shared {
    pub fn new(params: Params) -> Shared {
        Shared {
            params,
            paused: AtomicBool::new(false),
            flush: AtomicBool::new(false),
            consumed: AtomicU64::new(0),
            failed: AtomicBool::new(false),
        }
    }
}

pub struct Output {
    stream: cpal::Stream,
    pub producer: Producer<f32>,
    pub rate: u32,
    device: cpal::Device,
    pub follows_default: bool,
}

fn device_name(device: &cpal::Device) -> String {
    device.description().map(|d| d.name().to_string()).unwrap_or_else(|_| device.to_string())
}

pub fn list_devices() -> Vec<String> {
    let host = cpal::default_host();
    match host.output_devices() {
        Ok(devices) => devices.map(|d| device_name(&d)).collect(),
        Err(e) => {
            eprintln!("[engine] couldn't list audio devices: {e}");
            Vec::new()
        }
    }
}

/// Opens `preferred` by name, or the system default when it's empty or gone.
pub fn open(shared: Arc<Shared>, preferred: &str) -> Result<Output, String> {
    let host = cpal::default_host();
    let chosen = (!preferred.is_empty())
        .then(|| host.output_devices().ok()?.find(|d| device_name(d) == preferred))
        .flatten();
    let follows_default = chosen.is_none();
    let device = chosen.or_else(|| host.default_output_device()).ok_or("No audio output device was found.")?;
    let config = device.default_output_config().map_err(|e| format!("The audio device isn't usable ({e})."))?;
    let rate = config.sample_rate();
    let channels = usize::from(config.channels()).max(1);
    let mut stream_config = config.config();
    // shortcut: always ask for f32 and let WASAPI's converter handle integer-only devices; add a
    // per-format callback if a device ever refuses.
    stream_config.buffer_size = cpal::BufferSize::Default;

    let (producer, consumer) = RingBuffer::<f32>::new((rate as f32 * RING_SECONDS) as usize * 2);
    let mut render = Renderer::new(shared.clone(), consumer, rate, channels);
    let errors = shared.clone();
    let stream = device
        .build_output_stream::<f32, _, _>(
            stream_config,
            move |data, _| render.render(data),
            move |e| {
                eprintln!("[engine] audio device error: {e}");
                errors.failed.store(true, Ordering::Release);
            },
            None,
        )
        .map_err(|e| format!("Couldn't open {} ({e}).", device_name(&device)))?;
    stream.play().map_err(|e| format!("Couldn't start {} ({e}).", device_name(&device)))?;
    Ok(Output { stream, producer, rate, device, follows_default })
}

impl Output {
    /// True when Windows' default device moved and we're meant to follow it. cpal 0.18 no longer
    /// reports this on WASAPI, so the decode thread polls.
    pub fn default_changed(&self) -> bool {
        self.follows_default && cpal::default_host().default_output_device().is_some_and(|d| d != self.device)
    }

    pub fn pause_stream(&self) {
        let _ = self.stream.pause();
    }
}

/// Everything the callback owns. Built on the decode thread, moved into the callback once.
struct Renderer {
    shared: Arc<Shared>,
    consumer: Consumer<f32>,
    chain: Chain,
    channels: usize,
    fade: f32,
    fade_step: f32,
}

impl Renderer {
    fn new(shared: Arc<Shared>, consumer: Consumer<f32>, rate: u32, channels: usize) -> Renderer {
        Renderer { shared, consumer, chain: Chain::new(rate), channels, fade: 0.0, fade_step: 1.0 / (FADE_SECONDS * rate as f32) }
    }

    fn render(&mut self, data: &mut [f32]) {
        self.chain.sync(&self.shared.params);
        if self.shared.flush.load(Ordering::Acquire) {
            if let Ok(chunk) = self.consumer.read_chunk(self.consumer.slots()) {
                chunk.commit_all();
            }
            self.shared.flush.store(false, Ordering::Release);
        }
        let paused = self.shared.paused.load(Ordering::Relaxed);
        let frames = data.len() / self.channels;
        let wanted = if paused && self.fade == 0.0 { 0 } else { frames * 2 };
        let take = self.consumer.slots().min(wanted) & !1;
        let Ok(chunk) = self.consumer.read_chunk(take) else { return data.fill(0.0) };
        let (a, b) = chunk.as_slices();
        let mut samples = a.iter().chain(b.iter()).copied();
        let target = if paused { 0.0 } else { 1.0 };
        for frame in data.chunks_exact_mut(self.channels) {
            self.fade = if target > self.fade { (self.fade + self.fade_step).min(1.0) } else { (self.fade - self.fade_step).max(0.0) };
            let (l, r) = match (samples.next(), samples.next()) {
                (Some(l), Some(r)) => (l, r),
                _ => (0.0, 0.0),
            };
            let (l, r) = self.chain.frame(l, r, self.fade);
            write_frame(frame, l, r);
        }
        chunk.commit_all();
        self.shared.consumed.fetch_add((take / 2) as u64, Ordering::Release);
    }
}

/// Stereo into whatever the device has: mono gets the average, extra channels stay silent.
#[inline]
fn write_frame(frame: &mut [f32], l: f32, r: f32) {
    match frame {
        [only] => *only = (l + r) * 0.5,
        [fl, fr, rest @ ..] => {
            *fl = l;
            *fr = r;
            rest.fill(0.0);
        }
        [] => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::dsp::Snapshot;

    fn renderer(channels: usize) -> (Renderer, Producer<f32>, Arc<Shared>) {
        let shared = Arc::new(Shared::new(Params::new(Snapshot::default())));
        let (producer, consumer) = RingBuffer::new(64);
        (Renderer::new(shared.clone(), consumer, 48_000, channels), producer, shared)
    }

    #[test]
    fn maps_stereo_onto_any_channel_count() {
        let mut mono = [0.0];
        write_frame(&mut mono, 0.4, 0.2);
        assert!((mono[0] - 0.3).abs() < 1e-6);
        let mut surround = [9.0; 6];
        write_frame(&mut surround, 0.4, 0.2);
        assert_eq!(surround, [0.4, 0.2, 0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn underrun_plays_silence_and_counts_only_real_frames() {
        let (mut r, mut producer, shared) = renderer(2);
        for _ in 0..8 {
            producer.push(0.5).unwrap();
        }
        let mut out = [1.0; 32];
        r.render(&mut out);
        assert_eq!(shared.consumed.load(Ordering::Acquire), 4);
        assert!(out[8..].iter().all(|s| *s == 0.0));
        assert!(out.iter().all(|s| s.is_finite()));
    }

    #[test]
    fn flush_drops_buffered_audio() {
        let (mut r, mut producer, shared) = renderer(2);
        for _ in 0..20 {
            producer.push(0.5).unwrap();
        }
        shared.flush.store(true, Ordering::Release);
        let mut out = [0.0; 8];
        r.render(&mut out);
        assert!(!shared.flush.load(Ordering::Acquire));
        assert_eq!(shared.consumed.load(Ordering::Acquire), 0);
        assert!(out.iter().all(|s| *s == 0.0));
    }

    #[test]
    fn a_paused_output_stops_taking_audio_once_faded() {
        let (mut r, mut producer, shared) = renderer(2);
        shared.paused.store(true, Ordering::Relaxed);
        for _ in 0..20 {
            producer.push(0.5).unwrap();
        }
        let mut out = [0.0; 8];
        r.render(&mut out);
        assert_eq!(shared.consumed.load(Ordering::Acquire), 0);
        assert_eq!(producer.slots(), 64 - 20);
    }
}
