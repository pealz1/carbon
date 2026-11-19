use super::{Shared, renderer};
use coreaudio::audio_unit::audio_format::LinearPcmFlags;
use coreaudio::audio_unit::macos_helpers::{
    audio_unit_from_device_id_uninitialized, get_audio_device_ids_for_scope, get_audio_device_supports_scope,
    get_default_device_id, get_device_id_from_name, get_device_name,
};
use coreaudio::audio_unit::render_callback::{Args, data::Interleaved};
use coreaudio::audio_unit::{AudioUnit, Element, SampleFormat, Scope, StreamFormat};
use rtrb::Producer;
use std::sync::Arc;

pub struct Output {
    stream: AudioUnit,
    pub producer: Producer<f32>,
    pub rate: u32,
    device: u32,
    follows_default: bool,
}

pub fn list_devices() -> Vec<String> {
    get_audio_device_ids_for_scope(Scope::Output).unwrap_or_default().into_iter().filter_map(|id| get_device_name(id).ok()).collect()
}

pub fn open(shared: Arc<Shared>, preferred: &str) -> Result<Output, String> {
    let chosen = (!preferred.is_empty()).then(|| get_device_id_from_name(preferred, false)).flatten();
    let device = chosen.or_else(|| get_default_device_id(false)).ok_or("No audio output device was found.")?;
    let failed = |e| format!("Couldn't open the audio output ({e}).");
    let mut stream = audio_unit_from_device_id_uninitialized(device, false).map_err(failed)?;
    let hardware = stream.stream_format(Scope::Output, Element::Output).map_err(failed)?;
    let rate = hardware.sample_rate.round() as u32;
    if rate == 0 || hardware.channels == 0 {
        return Err("The audio output has no active format.".into());
    }
    let format = StreamFormat { sample_format: SampleFormat::F32, flags: LinearPcmFlags::IS_FLOAT | LinearPcmFlags::IS_PACKED, ..hardware };
    let (producer, mut render) = renderer(shared, rate, format.channels as usize);
    stream.set_stream_format(format, Scope::Input, Element::Output).map_err(failed)?;
    stream.set_render_callback(move |args: Args<Interleaved<f32>>| {
        render.render(args.data.buffer);
        Ok(())
    }).map_err(failed)?;
    stream.initialize().map_err(failed)?;
    stream.start().map_err(failed)?;
    Ok(Output { stream, producer, rate, device, follows_default: chosen.is_none() })
}

impl Output {
    pub fn default_changed(&self) -> bool {
        if self.follows_default {
            get_default_device_id(false) != Some(self.device)
        } else {
            !get_audio_device_supports_scope(self.device, Scope::Output).unwrap_or(false)
        }
    }

    pub fn pause_stream(&mut self) {
        let _ = self.stream.stop();
    }
}
