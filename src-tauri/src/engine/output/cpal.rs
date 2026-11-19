use super::{Renderer, Shared, renderer};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rtrb::Producer;
use std::sync::Arc;
use std::sync::atomic::Ordering;

pub struct Output {
    stream: cpal::Stream,
    pub producer: Producer<f32>,
    pub rate: u32,
    device: cpal::Device,
    follows_default: bool,
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
    stream_config.buffer_size = cpal::BufferSize::Default;

    let (producer, render) = renderer(shared.clone(), rate, channels);
    use cpal::SampleFormat::*;
    let stream = match config.sample_format() {
        F32 => build::<f32>, F64 => build::<f64>,
        I8 => build::<i8>, I16 => build::<i16>, I24 => build::<cpal::I24>, I32 => build::<i32>, I64 => build::<i64>,
        U8 => build::<u8>, U16 => build::<u16>, U24 => build::<cpal::U24>, U32 => build::<u32>, U64 => build::<u64>,
        other => return Err(format!("Unsupported PCM output format {other}.")),
    }(&device, stream_config, render, shared).map_err(|e| format!("Couldn't open {} ({e}).", device_name(&device)))?;
    stream.play().map_err(|e| format!("Couldn't start {} ({e}).", device_name(&device)))?;
    Ok(Output { stream, producer, rate, device, follows_default })
}

fn build<T: cpal::SizedSample + cpal::FromSample<f32>>(
    device: &cpal::Device, config: cpal::StreamConfig, mut render: Renderer, shared: Arc<Shared>,
) -> Result<cpal::Stream, cpal::Error> {
    device.build_output_stream::<T, _, _>(config,
        move |data, _| render.render_with(data, T::from_sample),
        move |e| {
            eprintln!("[engine] audio device error: {e}");
            shared.failed.store(true, Ordering::Release);
        }, None)
}

impl Output {
    /// True when Windows' default device moved and we're meant to follow it. cpal 0.18 no longer
    /// reports this on WASAPI, so the decode thread polls.
    pub fn default_changed(&self) -> bool {
        self.follows_default && cpal::default_host().default_output_device().is_some_and(|d| d != self.device)
    }

    pub fn pause_stream(&mut self) {
        let _ = self.stream.pause();
    }
}
