//! CUE sheets: a text file beside one long audio file (a whole CD as a single FLAC, say) that
//! says where each track starts. The scan lists those tracks instead of the file, and the engine
//! plays each as a range of it. Sheets naming several files are left alone: those files are
//! already one per track.
use super::LocalTrack;
use crate::engine::loudness;
use crate::engine::queue::Clip;
use std::collections::HashMap;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

/// CUE times are minutes:seconds:frames, 75 frames to the second.
const FRAMES_PER_SECOND: u64 = 75;
const MAX_SHEET_BYTES: u64 = 1024 * 1024;
const MAX_TRACKS: usize = 999;
const BOM: &[u8] = b"\xEF\xBB\xBF";
/// Windows-1252 for bytes 0x80 to 0x9F; everything else matches Latin-1. Unassigned bytes map to U+FFFD.
const WINDOWS_1252: [char; 32] = [
    '\u{20AC}', '\u{FFFD}', '\u{201A}', '\u{0192}', '\u{201E}', '\u{2026}', '\u{2020}', '\u{2021}', '\u{02C6}', '\u{2030}', '\u{0160}',
    '\u{2039}', '\u{0152}', '\u{FFFD}', '\u{017D}', '\u{FFFD}', '\u{FFFD}', '\u{2018}', '\u{2019}', '\u{201C}', '\u{201D}', '\u{2022}',
    '\u{2013}', '\u{2014}', '\u{02DC}', '\u{2122}', '\u{0161}', '\u{203A}', '\u{0153}', '\u{FFFD}', '\u{017E}', '\u{0178}',
];

#[derive(Debug, PartialEq, Clone, Default)]
pub struct Sheet {
    /// The name on the FILE line, as written.
    pub file: String,
    pub title: Option<String>,
    pub performer: Option<String>,
    pub year: Option<u32>,
    pub disc_no: Option<u32>,
    pub album_gain_db: Option<f32>,
    pub album_peak: Option<f32>,
    pub tracks: Vec<SheetTrack>,
}

#[derive(Debug, PartialEq, Clone, Default)]
pub struct SheetTrack {
    pub number: u32,
    pub title: Option<String>,
    pub performer: Option<String>,
    /// INDEX 01: where the track itself starts, after any pregap.
    pub start_ms: u64,
    pub gain_db: Option<f32>,
    pub peak: Option<f32>,
}

/// Why a sheet doesn't split anything.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Skipped {
    NoFile,
    SeveralFiles,
    NothingToSplit,
    NoStart(u32),
    OutOfOrder(u32),
    TooManyTracks,
}

impl fmt::Display for Skipped {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Skipped::NoFile => write!(f, "it names no audio file"),
            Skipped::SeveralFiles => write!(f, "it names several files, which are already one per track"),
            Skipped::NothingToSplit => write!(f, "it has fewer than two audio tracks"),
            Skipped::NoStart(n) => write!(f, "track {n} has no INDEX 01"),
            Skipped::OutOfOrder(n) => write!(f, "track {n} starts before the one ahead of it"),
            Skipped::TooManyTracks => write!(f, "it has more than {MAX_TRACKS} tracks"),
        }
    }
}

/// Sheets are UTF-8 (with or without a BOM) or, from older Windows rippers, Windows-1252.
pub fn decode(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(BOM).unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => bytes.iter().map(|&b| if (0x80..0xA0).contains(&b) { WINDOWS_1252[usize::from(b - 0x80)] } else { char::from(b) }).collect(),
    }
}

/// "03:27:45" (minutes may run past 99) → milliseconds.
fn parse_time(text: &str) -> Option<u64> {
    let mut parts = text.trim().split(':').map(|p| p.parse::<u64>().ok());
    let (minutes, seconds, frames) = (parts.next()??, parts.next()??, parts.next()??);
    if parts.next().is_some() || seconds >= 60 || frames >= FRAMES_PER_SECOND || minutes > 100_000 {
        return None;
    }
    Some((minutes * 60 + seconds) * 1000 + (frames * 1000 + FRAMES_PER_SECOND / 2) / FRAMES_PER_SECOND)
}

/// The command word and what follows it.
fn split_word(line: &str) -> (&str, &str) {
    let line = line.trim();
    line.split_once(char::is_whitespace).map_or((line, ""), |(word, rest)| (word, rest.trim()))
}

/// A value with its quotes removed; a quoted value may itself hold quotes.
fn unquote(text: &str) -> Option<String> {
    let text = text.trim();
    let inner = text.strip_prefix('"').map_or(text, |rest| rest.rfind('"').map_or(rest, |end| &rest[..end]));
    Some(inner.trim().to_string()).filter(|v| !v.is_empty())
}

/// `"Disc 1.flac" WAVE` or `Disc 1.flac WAVE` → the name without the type that follows it.
fn file_name(rest: &str) -> Option<String> {
    if rest.starts_with('"') {
        return unquote(rest);
    }
    unquote(rest.rsplit_once(char::is_whitespace).map_or(rest, |(name, _kind)| name))
}

#[derive(Default)]
struct Parser {
    sheet: Sheet,
    files: usize,
    /// The track being read and whether it has had its INDEX 01. Data tracks are passed over.
    open: Option<(SheetTrack, bool)>,
    problem: Option<Skipped>,
}

impl Parser {
    fn close_track(&mut self) {
        match self.open.take() {
            Some((track, true)) => self.sheet.tracks.push(track),
            Some((track, false)) => self.problem = self.problem.or(Some(Skipped::NoStart(track.number))),
            None => {}
        }
    }

    fn track(&mut self, rest: &str) {
        self.close_track();
        let (number, kind) = split_word(rest);
        if kind.eq_ignore_ascii_case("AUDIO") {
            self.open = Some((SheetTrack { number: number.parse().unwrap_or(self.sheet.tracks.len() as u32 + 1), ..SheetTrack::default() }, false));
        }
    }

    fn index(&mut self, rest: &str) {
        let (number, time) = split_word(rest);
        if let (Some((track, started)), Ok(1), Some(ms)) = (self.open.as_mut(), number.parse::<u32>(), parse_time(time)) {
            track.start_ms = ms;
            *started = true;
        }
    }

    fn remark(&mut self, rest: &str) {
        let (key, value) = split_word(rest);
        let Some(value) = unquote(value) else { return };
        let track = self.open.as_mut().map(|(track, _)| track);
        match (key.to_ascii_uppercase().as_str(), track) {
            ("DATE", _) => self.sheet.year = value.get(..4).and_then(|y| y.parse().ok()).filter(|y| *y > 0),
            ("DISCNUMBER", _) => self.sheet.disc_no = value.parse().ok().filter(|n| *n > 0),
            ("REPLAYGAIN_ALBUM_GAIN", _) => self.sheet.album_gain_db = loudness::parse_gain(&value),
            ("REPLAYGAIN_ALBUM_PEAK", _) => self.sheet.album_peak = loudness::parse_peak(&value),
            ("REPLAYGAIN_TRACK_GAIN", Some(track)) => track.gain_db = loudness::parse_gain(&value),
            ("REPLAYGAIN_TRACK_PEAK", Some(track)) => track.peak = loudness::parse_peak(&value),
            _ => {}
        }
    }

    fn line(&mut self, line: &str) {
        let (command, rest) = split_word(line);
        match command.to_ascii_uppercase().as_str() {
            "FILE" => {
                self.close_track();
                self.files += 1;
                self.sheet.file = file_name(rest).unwrap_or_default();
            }
            "TRACK" => self.track(rest),
            "INDEX" => self.index(rest),
            "REM" => self.remark(rest),
            "TITLE" => match self.open.as_mut() {
                Some((track, _)) => track.title = unquote(rest),
                None => self.sheet.title = unquote(rest),
            },
            "PERFORMER" => match self.open.as_mut() {
                Some((track, _)) => track.performer = unquote(rest),
                None => self.sheet.performer = unquote(rest),
            },
            _ => {} // CATALOG, ISRC, FLAGS, PREGAP, SONGWRITER…: nothing Carbon shows
        }
    }

    fn finish(mut self) -> Result<Sheet, Skipped> {
        self.close_track();
        let tracks = &self.sheet.tracks;
        let out_of_order = tracks.windows(2).find(|pair| pair[1].start_ms <= pair[0].start_ms).map(|pair| Skipped::OutOfOrder(pair[1].number));
        let problem = match (self.files, &self.sheet.file) {
            (0, _) => Some(Skipped::NoFile),
            (1, name) if name.is_empty() => Some(Skipped::NoFile),
            (1, _) => None,
            _ => Some(Skipped::SeveralFiles),
        }
        .or(self.problem)
        .or(out_of_order)
        .or((tracks.len() < 2).then_some(Skipped::NothingToSplit))
        .or((tracks.len() > MAX_TRACKS).then_some(Skipped::TooManyTracks));
        problem.map_or(Ok(self.sheet), Err)
    }
}

/// Reads a sheet's text. Only a sheet with one FILE and at least two audio tracks, each with an
/// INDEX 01 later than the last, comes back; anything else says why it was skipped.
pub fn parse(text: &str) -> Result<Sheet, Skipped> {
    let mut parser = Parser::default();
    text.lines().for_each(|line| parser.line(line));
    parser.finish()
}

/// Virtual tracks keep their id for as long as the file's path and the sheet's numbering do.
pub fn track_id(path: &Path, number: u32) -> String {
    format!("{:x}", md5::compute(format!("{}\u{0}cue{number}", path.to_string_lossy())))
}

/// The sheet's tracks as library entries cut from `whole`, the audio file read as one track.
/// None when the sheet describes a longer recording than the file holds.
pub fn tracks(whole: &LocalTrack, sheet: &Sheet) -> Option<Vec<LocalTrack>> {
    if sheet.tracks.last()?.start_ms >= whole.duration_ms {
        return None;
    }
    let ends = sheet.tracks.iter().skip(1).map(|next| Some(next.start_ms)).chain([None]);
    // One file is one album, so a gain measured over all of it is the album's.
    let album_level = [(sheet.album_gain_db, sheet.album_peak), (whole.album_gain_db, whole.album_peak), (whole.replay_gain_db, whole.replay_peak)];
    let (album_gain_db, album_peak) = album_level.into_iter().find(|(gain, _)| gain.is_some()).unwrap_or((None, None));
    let album = sheet.title.clone().unwrap_or_else(|| if whole.album.is_empty() { whole.title.clone() } else { whole.album.clone() });
    let cut = |(track, end_ms): (&SheetTrack, Option<u64>)| LocalTrack {
        id: track_id(Path::new(&whole.path), track.number),
        title: track.title.clone().unwrap_or_else(|| format!("Track {:02}", track.number)),
        artists: track.performer.clone().or_else(|| sheet.performer.clone()).map_or_else(|| whole.artists.clone(), |p| vec![p]),
        album: album.clone(),
        album_artist: sheet.performer.clone().unwrap_or_else(|| whole.album_artist.clone()),
        track_no: Some(track.number),
        disc_no: sheet.disc_no.or(whole.disc_no),
        year: sheet.year.or(whole.year),
        duration_ms: end_ms.unwrap_or(whole.duration_ms) - track.start_ms,
        replay_gain_db: track.gain_db,
        replay_peak: track.peak,
        album_gain_db,
        album_peak,
        clip: Some(Clip { start_ms: track.start_ms, end_ms }),
        ..whole.clone()
    };
    Some(sheet.tracks.iter().zip(ends).map(cut).collect())
}

fn stem(path: &Path) -> String {
    path.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// The audio file beside `sheet_path` that it splits: the one its FILE line names; else one with
/// that name's stem (sheets often still say .wav after the rip was encoded to FLAC); else one
/// with the sheet's own stem. Only the name is used, so a sheet can't point outside its folder.
pub fn audio_for<'a>(sheet_path: &Path, named: &str, siblings: &[&'a PathBuf]) -> Option<&'a PathBuf> {
    let named = Path::new(named.rsplit(['/', '\\']).next().unwrap_or(named));
    let name_of = |p: &Path| p.file_name().map(|n| n.to_string_lossy().to_lowercase());
    let by = |matches: &dyn Fn(&Path) -> bool| siblings.iter().copied().find(|s| matches(s));
    by(&|s| name_of(s) == name_of(named)).or_else(|| by(&|s| stem(s) == stem(named))).or_else(|| by(&|s| stem(s) == stem(sheet_path)))
}

fn load(path: &Path) -> Result<Sheet, String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX_SHEET_BYTES {
        return Err("it is too large to be a CUE sheet".into());
    }
    parse(&decode(&fs::read(path).map_err(|e| e.to_string())?)).map_err(|why| why.to_string())
}

/// Every audio file a valid sheet splits, with that sheet. Skipped sheets are logged.
pub fn assign(sheets: &[PathBuf], audio: &[PathBuf]) -> HashMap<PathBuf, Sheet> {
    let mut by_dir: HashMap<&Path, Vec<&PathBuf>> = HashMap::new();
    for file in audio {
        by_dir.entry(file.parent().unwrap_or(Path::new(""))).or_default().push(file);
    }
    let mut split = HashMap::new();
    for path in sheets {
        let siblings = path.parent().and_then(|dir| by_dir.get(dir));
        let found = load(path).and_then(|sheet| {
            let audio = siblings.and_then(|s| audio_for(path, &sheet.file, s)).ok_or("the audio file it names isn't beside it")?;
            Ok((audio.clone(), sheet))
        });
        match found {
            // Two sheets for one file: the first (in path order) wins.
            Ok((audio, sheet)) => {
                split.entry(audio).or_insert(sheet);
            }
            Err(why) => eprintln!("[library] skipped CUE sheet {}: {why}", path.display()),
        }
    }
    split
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub const SHEET: &str = "REM GENRE Jazz\r\nREM DATE 1959\r\nREM DISCNUMBER 2\r\nREM REPLAYGAIN_ALBUM_GAIN -6.50 dB\r\nPERFORMER \"Miles Davis\"\r\nTITLE \"Kind of Blue\"\r\nFILE \"Kind of Blue.wav\" WAVE\r\n  TRACK 01 AUDIO\r\n    TITLE \"So What\"\r\n    PERFORMER \"Miles Davis\"\r\n    REM REPLAYGAIN_TRACK_GAIN -5.25 dB\r\n    INDEX 01 00:00:00\r\n  TRACK 02 AUDIO\r\n    TITLE Freddie Freeloader\r\n    INDEX 00 00:01:50\r\n    INDEX 01 00:02:00\r\n  TRACK 03 AUDIO\r\n    TITLE \"Blue in \"Green\"\"\r\n    PERFORMER \"Bill Evans\"\r\n    ISRC USSM15900113\r\n    INDEX 01 00:03:37\r\n";

    fn whole(path: &str, duration_ms: u64) -> LocalTrack {
        LocalTrack {
            id: "whole".into(),
            path: path.into(),
            title: "Kind of Blue".into(),
            artists: vec!["File Artist".into()],
            album: String::new(),
            album_artist: "File Artist".into(),
            track_no: None,
            disc_no: None,
            year: Some(1997),
            duration_ms,
            artwork: Some("cover.jpg".into()),
            replay_gain_db: Some(-7.0),
            replay_peak: Some(0.9),
            album_gain_db: None,
            album_peak: None,
            size: 10,
            modified: 20,
            clip: None,
        }
    }

    #[test]
    fn parses_quoted_and_bare_values_remarks_and_crlf() {
        let sheet = parse(SHEET).unwrap();
        assert_eq!((sheet.file.as_str(), sheet.title.as_deref(), sheet.performer.as_deref()), ("Kind of Blue.wav", Some("Kind of Blue"), Some("Miles Davis")));
        assert_eq!((sheet.year, sheet.disc_no, sheet.album_gain_db), (Some(1959), Some(2), Some(-6.5)));
        let titles: Vec<_> = sheet.tracks.iter().map(|t| (t.number, t.title.as_deref().unwrap(), t.start_ms)).collect();
        // INDEX 00 (the pregap) is not where a track starts; 37 frames are 493 ms.
        assert_eq!(titles, vec![(1, "So What", 0), (2, "Freddie Freeloader", 2000), (3, "Blue in \"Green\"", 3493)]);
        assert_eq!((sheet.tracks[0].gain_db, sheet.tracks[1].gain_db), (Some(-5.25), None));
        assert_eq!((sheet.tracks[1].performer.as_deref(), sheet.tracks[2].performer.as_deref()), (None, Some("Bill Evans")));
    }

    #[test]
    fn reads_times_at_75_frames_a_second() {
        assert_eq!(parse_time("00:00:00"), Some(0));
        assert_eq!(parse_time("01:02:74"), Some(62_987));
        assert_eq!(parse_time("123:00:15"), Some(123 * 60_000 + 200));
        for bad in ["", "1:2", "00:60:00", "00:00:75", "a:b:c", "00:00:00:00", "-1:00:00"] {
            assert_eq!(parse_time(bad), None, "{bad}");
        }
    }

    #[test]
    fn decodes_utf8_with_or_without_a_bom_then_windows_1252() {
        assert_eq!(decode(b"\xEF\xBB\xBFTITLE \"Caf\xC3\xA9\""), "TITLE \"Café\"");
        assert_eq!(decode("TITLE Björk".as_bytes()), "TITLE Björk");
        assert_eq!(decode(b"TITLE \"Caf\xE9 \x96 \x93Live\x94 \x80\""), "TITLE \"Café \u{2013} \u{201C}Live\u{201D} \u{20AC}\"");
        let sheet = parse(&decode(&[BOM, SHEET.replace("So What", "Sín").as_bytes()].concat())).unwrap();
        assert_eq!(sheet.tracks[0].title.as_deref(), Some("Sín")); // a BOM doesn't hide the first line
        assert_eq!(sheet.year, Some(1959));
    }

    #[test]
    fn says_why_a_sheet_splits_nothing() {
        let two = "FILE a.wav WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 00:05:00\n";
        assert_eq!(parse(two).unwrap().file, "a.wav");
        assert_eq!(parse("FILE \"my rip.flac\" WAVE\ntrack 01 audio\nindex 01 00:00:00\nTrack 02 Audio\nIndex 01 00:05:00").unwrap().file, "my rip.flac");
        assert_eq!(parse("FILE my rip.flac WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 00:05:00").unwrap().file, "my rip.flac");
        assert_eq!(parse(""), Err(Skipped::NoFile));
        assert_eq!(parse("TRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 00:01:00"), Err(Skipped::NoFile));
        let per_track = "FILE 01.wav WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nFILE 02.wav WAVE\nTRACK 02 AUDIO\nINDEX 01 00:00:00\n";
        assert_eq!(parse(per_track), Err(Skipped::SeveralFiles));
        assert_eq!(parse("FILE a.wav WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\n"), Err(Skipped::NothingToSplit));
        assert_eq!(parse(&two.replace("INDEX 01 00:05:00", "INDEX 00 00:05:00")), Err(Skipped::NoStart(2)));
        assert_eq!(parse(&two.replace("00:05:00", "00:00:00")), Err(Skipped::OutOfOrder(2)));
        assert_eq!(parse(&two.replace("00:05:00", "00:05:99")), Err(Skipped::NoStart(2)));
        // A data track is passed over, not played.
        let mixed = format!("{two}TRACK 03 MODE1/2352\nINDEX 01 00:09:00\n");
        assert_eq!(parse(&mixed).unwrap().tracks.len(), 2);
        assert!(Skipped::SeveralFiles.to_string().contains("several files"));
    }

    #[test]
    fn cuts_the_file_into_tracks_with_stable_ids() {
        let file = whole("C:/Music/Kind of Blue.flac", 5_000);
        let tracks = tracks(&file, &parse(SHEET).unwrap()).unwrap();
        let ranges: Vec<_> = tracks.iter().map(|t| (t.clip.unwrap().start_ms, t.clip.unwrap().end_ms, t.duration_ms)).collect();
        assert_eq!(ranges, vec![(0, Some(2000), 2000), (2000, Some(3493), 1493), (3493, None, 1507)]);
        let second = &tracks[1];
        assert_eq!((second.title.as_str(), second.album.as_str(), second.album_artist.as_str()), ("Freddie Freeloader", "Kind of Blue", "Miles Davis"));
        assert_eq!((second.track_no, second.disc_no, second.year), (Some(2), Some(2), Some(1959)));
        assert_eq!(tracks[2].artists, vec!["Bill Evans".to_string()]);
        assert_eq!((second.path.as_str(), second.artwork.as_deref(), second.size), ("C:/Music/Kind of Blue.flac", Some("cover.jpg"), 10));
        assert_eq!((tracks[0].replay_gain_db, second.replay_gain_db, second.album_gain_db), (Some(-5.25), None, Some(-6.5)));

        let ids: Vec<_> = tracks.iter().map(|t| t.id.clone()).collect();
        assert_eq!(ids.iter().collect::<std::collections::HashSet<_>>().len(), 3);
        assert!(!ids.contains(&file.id));
        assert_eq!(ids[1], track_id(Path::new("C:/Music/Kind of Blue.flac"), 2)); // the same on every scan
        assert_ne!(ids[1], track_id(Path::new("C:/Music/Other.flac"), 2));
    }

    #[test]
    fn falls_back_to_the_file_for_what_the_sheet_leaves_out() {
        let bare = "FILE a.wav WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 00:02:00\n";
        let tracks = tracks(&whole("a.wav", 5_000), &parse(bare).unwrap()).unwrap();
        let t = &tracks[1];
        assert_eq!((t.title.as_str(), t.artists[0].as_str(), t.album.as_str(), t.year), ("Track 02", "File Artist", "Kind of Blue", Some(1997)));
        assert_eq!((t.album_gain_db, t.album_peak, t.replay_gain_db), (Some(-7.0), Some(0.9), None));
        // A sheet for a longer recording than the file holds doesn't fit it.
        assert!(super::tracks(&whole("a.wav", 2_000), &parse(bare).unwrap()).is_none());
    }

    #[test]
    fn finds_the_audio_file_by_name_then_stem_then_the_sheets_own_name() {
        let files: Vec<PathBuf> = ["D:/m/Album.flac", "D:/m/Other.mp3", "D:/m/CDImage.wav"].iter().map(PathBuf::from).collect();
        let siblings: Vec<&PathBuf> = files.iter().collect();
        let sheet = Path::new("D:/m/Album.cue");
        assert_eq!(audio_for(sheet, "cdimage.WAV", &siblings), Some(&files[2]));
        assert_eq!(audio_for(sheet, "Other.wav", &siblings), Some(&files[1])); // encoded after the sheet was written
        assert_eq!(audio_for(sheet, "gone.wav", &siblings), Some(&files[0]));
        assert_eq!(audio_for(sheet, "C:\\rips\\..\\Other.mp3", &siblings), Some(&files[1])); // only the name counts
        assert_eq!(audio_for(Path::new("D:/m/Nothing.cue"), "gone.wav", &siblings), None);
    }
}
