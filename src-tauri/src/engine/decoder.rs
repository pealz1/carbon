//! Symphonia wrapper: opens a local file and yields interleaved stereo f32 at the file's rate.
//! Encoder delay and padding are trimmed by Symphonia (gapless is on by default). Every call into
//! Symphonia is contained, so a panic on a corrupt file becomes an error for that track.
use super::contain::{DAMAGED, contain};
use std::fs::File;
use std::path::Path;
use symphonia::core::codecs::CodecParameters;
use symphonia::core::codecs::audio::{AudioDecoder, AudioDecoderOptions};
use symphonia::core::errors::Error;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo, TrackType};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::units::{Time, TimeBase};

/// A run of corrupt packets this long means the file is broken, not just a glitch.
const MAX_BAD_PACKETS: u32 = 64;

pub struct Decoder {
    reader: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    rate: u32,
    time_base: Option<TimeBase>,
    duration_ms: Option<u64>,
    scratch: Vec<f32>,
    skip_frames: usize,
    /// Set after a contained panic: the decoder's state can't be trusted any more.
    poisoned: bool,
}

fn describe(e: &Error) -> String {
    match e {
        Error::IoError(io) => format!("the file couldn't be read ({io})"),
        Error::Unsupported(_) => "this audio format isn't supported".into(),
        Error::DecodeError(_) => DAMAGED.into(),
        other => other.to_string(),
    }
}

impl Decoder {
    pub fn open(path: &Path) -> Result<Decoder, String> {
        contain(|| Decoder::open_unguarded(path))
    }

    fn open_unguarded(path: &Path) -> Result<Decoder, String> {
        let file = File::open(path).map_err(|e| format!("the file couldn't be opened ({e})"))?;
        let mss = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }
        let reader = symphonia::default::get_probe()
            .probe(&hint, mss, FormatOptions::default(), MetadataOptions::default())
            .map_err(|e| describe(&e))?;
        let track = reader.default_track(TrackType::Audio).ok_or("there's no audio in this file")?;
        let Some(CodecParameters::Audio(params)) = &track.codec_params else {
            return Err("there's no audio in this file".into());
        };
        let rate = params.sample_rate.ok_or("the file doesn't say its sample rate")?;
        let decoder = symphonia::default::get_codecs()
            .make_audio_decoder(params, &AudioDecoderOptions::default())
            .map_err(|e| describe(&e))?;
        let time_base = track.time_base;
        let duration_ms = match (time_base, track.duration) {
            (Some(tb), Some(d)) => tb.calc_duration(d).map(|t| t.as_millis().max(0) as u64),
            _ => track.num_frames.map(|n| n * 1000 / u64::from(rate)),
        };
        Ok(Decoder {
            track_id: track.id,
            reader,
            decoder,
            rate,
            time_base,
            duration_ms,
            scratch: Vec::new(),
            skip_frames: 0,
            poisoned: false,
        })
    }

    pub fn rate(&self) -> u32 {
        self.rate
    }

    pub fn duration_ms(&self) -> Option<u64> {
        self.duration_ms
    }

    /// Appends the next packet's audio to `out` as interleaved stereo. Ok(false) = end of file.
    pub fn next_chunk(&mut self, out: &mut Vec<f32>) -> Result<bool, String> {
        self.guarded(|d| d.next_chunk_unguarded(out))
    }

    /// Seeks to `ms`; returns where playback really resumes. Frames before the target are
    /// dropped from the next chunk so the position is sample-accurate.
    pub fn seek(&mut self, ms: u64) -> Result<u64, String> {
        self.guarded(|d| d.seek_unguarded(ms))
    }

    fn guarded<T>(&mut self, work: impl FnOnce(&mut Decoder) -> Result<T, String>) -> Result<T, String> {
        if self.poisoned {
            return Err(DAMAGED.into());
        }
        let result = contain(|| work(&mut *self));
        self.poisoned = result.as_ref().is_err_and(|e| e == DAMAGED);
        result
    }

    fn next_chunk_unguarded(&mut self, out: &mut Vec<f32>) -> Result<bool, String> {
        let mut bad = 0;
        loop {
            let packet = match self.reader.next_packet() {
                Ok(Some(p)) => p,
                Ok(None) => return Ok(false),
                Err(Error::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(false),
                Err(Error::ResetRequired) => return Ok(false), // shortcut: chained streams end the track; rare in music files
                Err(e) => return Err(describe(&e)),
            };
            if packet.track_id != self.track_id {
                continue;
            }
            match self.decoder.decode(&packet) {
                Ok(buf) => {
                    let channels = buf.spec().channels().count().max(1);
                    buf.copy_to_vec_interleaved(&mut self.scratch);
                    let frames = self.scratch.len() / channels;
                    let skip = self.skip_frames.min(frames);
                    self.skip_frames -= skip;
                    append_stereo(&self.scratch[skip * channels..], channels, out);
                    return Ok(true);
                }
                Err(Error::DecodeError(_)) | Err(Error::IoError(_)) if bad < MAX_BAD_PACKETS => bad += 1,
                Err(e) => return Err(describe(&e)),
            }
        }
    }

    fn seek_unguarded(&mut self, ms: u64) -> Result<u64, String> {
        let time = Time::try_from_secs_f64(ms as f64 / 1000.0).ok_or("that position is out of range")?;
        let seeked = self
            .reader
            .seek(SeekMode::Accurate, SeekTo::Time { time, track_id: Some(self.track_id) })
            .map_err(|e| format!("couldn't seek: {}", describe(&e)))?;
        self.decoder.reset();
        self.skip_frames = 0;
        if let Some(tb) = self.time_base
            && let (Some(req), Some(act)) = (tb.calc_time(seeked.required_ts), tb.calc_time(seeked.actual_ts))
        {
            let gap = (req.as_secs_f64() - act.as_secs_f64()).max(0.0);
            self.skip_frames = (gap * f64::from(self.rate)).round() as usize;
            return Ok(req.as_millis().max(0) as u64);
        }
        Ok(ms)
    }
}

/// Mono is duplicated; for more than two channels the front pair is kept.
fn append_stereo(samples: &[f32], channels: usize, out: &mut Vec<f32>) {
    if channels == 2 {
        out.extend_from_slice(samples);
        return;
    }
    for frame in samples.chunks_exact(channels) {
        let (l, r) = if channels == 1 { (frame[0], frame[0]) } else { (frame[0], frame[1]) };
        out.extend_from_slice(&[l, r]);
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::io::Write;

    /// Writes a 16-bit PCM WAV of a sine so decode paths can be tested without fixtures.
    pub fn write_wav(path: &Path, rate: u32, channels: u16, seconds: f32, amplitude: f32) {
        let frames = (rate as f32 * seconds) as u32;
        let data_len = frames * u32::from(channels) * 2;
        let mut bytes = Vec::with_capacity(44 + data_len as usize);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&rate.to_le_bytes());
        bytes.extend_from_slice(&(rate * u32::from(channels) * 2).to_le_bytes());
        bytes.extend_from_slice(&(channels * 2).to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        for n in 0..frames {
            let s = (amplitude * (2.0 * std::f32::consts::PI * 440.0 * n as f32 / rate as f32).sin() * 32767.0) as i16;
            for _ in 0..channels {
                bytes.extend_from_slice(&s.to_le_bytes());
            }
        }
        File::create(path).and_then(|mut f| f.write_all(&bytes)).expect("write wav");
    }

    pub fn temp_wav(name: &str, rate: u32, channels: u16, seconds: f32) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("carbon-test-{}-{name}.wav", std::process::id()));
        write_wav(&path, rate, channels, seconds, 0.5);
        path
    }

    #[test]
    fn decodes_a_whole_file_as_stereo() {
        let path = temp_wav("mono", 22_050, 1, 0.5);
        let mut d = Decoder::open(&path).unwrap();
        assert_eq!(d.rate(), 22_050);
        assert_eq!(d.duration_ms(), Some(500));
        let mut out = Vec::new();
        while d.next_chunk(&mut out).unwrap() {}
        assert_eq!(out.len(), 22_050 / 2 * 2);
        assert!(out.chunks_exact(2).all(|f| f[0] == f[1]));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn seeks_sample_accurately() {
        let path = temp_wav("seek", 8_000, 2, 1.0);
        let mut d = Decoder::open(&path).unwrap();
        assert_eq!(d.seek(250).unwrap(), 250);
        let mut out = Vec::new();
        while d.next_chunk(&mut out).unwrap() {}
        assert_eq!(out.len() / 2, 6_000);
        let _ = std::fs::remove_file(path);
    }

    /// Corrupt input of every shape must come back as an error (or a clean end), never a panic
    /// or a hang: truncated headers, absurd sizes, real magic numbers followed by noise.
    #[test]
    fn broken_files_fail_cleanly() {
        let dir = std::env::temp_dir().join(format!("carbon-test-{}-broken", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let good = temp_wav("broken-src", 8_000, 2, 0.2);
        let wav = std::fs::read(&good).unwrap();
        let mut huge = wav.clone();
        huge[40..44].copy_from_slice(&u32::MAX.to_le_bytes()); // data chunk claims 4 GB
        let mut zero_rate = wav.clone();
        zero_rate[24..28].copy_from_slice(&0u32.to_le_bytes());
        let noise: Vec<u8> = (0..8192u32).map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8).collect();
        let cases: [(&str, Vec<u8>); 7] = [
            ("empty.mp3", Vec::new()),
            ("header-only.wav", wav[..30].to_vec()),
            ("truncated.wav", wav[..wav.len() / 3].to_vec()),
            ("huge.wav", huge),
            ("zero-rate.wav", zero_rate),
            ("noise.flac", [b"fLaC".as_slice(), &noise].concat()),
            ("noise.m4a", [b"\0\0\0\x18ftypM4A ".as_slice(), &noise].concat()),
        ];
        for (name, bytes) in cases {
            let path = dir.join(name);
            std::fs::write(&path, bytes).unwrap();
            if let Ok(mut d) = Decoder::open(&path) {
                let mut out = Vec::new();
                let mut packets = 0;
                while let Ok(true) = d.next_chunk(&mut out) {
                    packets += 1;
                    assert!(packets < 10_000, "{name} never ended");
                }
            }
        }
        let _ = std::fs::remove_dir_all(dir);
        let _ = std::fs::remove_file(good);
    }

    #[test]
    fn explains_unreadable_files() {
        let missing = Decoder::open(Path::new("Z:/nope/missing.flac"));
        assert!(missing.err().unwrap().contains("couldn't be opened"));
        let junk = std::env::temp_dir().join(format!("carbon-test-{}-junk.mp3", std::process::id()));
        std::fs::write(&junk, b"definitely not audio").unwrap();
        assert!(Decoder::open(&junk).is_err());
        let _ = std::fs::remove_file(junk);
    }
}
