//! The tag editor: reads the tags a file really has and writes edited ones back with lofty.
//! Each format's own tag is split into the fields Carbon edits and a remainder, so everything
//! the editor doesn't show (artwork, lyrics, ReplayGain, private frames) is written back as it was.
use crate::engine::contain::contain;
use lofty::aac::AacFile;
use lofty::config::{ParseOptions, WriteOptions};
use lofty::file::{AudioFile, FileType};
use lofty::flac::FlacFile;
use lofty::iff::wav::WavFile;
use lofty::mp4::Mp4File;
use lofty::mpeg::MpegFile;
use lofty::ogg::VorbisFile;
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::items::Timestamp;
use lofty::tag::{ItemValue, MergeTag, SplitTag, Tag, TagItem};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::Seek;
use std::path::{Path, PathBuf};

pub const MAX_TEXT: usize = 300;
pub const MAX_ARTISTS: usize = 20;
pub const MAX_TRACK_NO: u32 = 9999;
pub const MAX_DISC_NO: u32 = 999;
pub const MAX_YEAR: u32 = 9999;
/// Windows: another program has the file open and won't share it.
const SHARING_VIOLATION: i32 = 32;
const LOCK_VIOLATION: i32 = 33;

/// The fields the editor shows. Empty text and `None` mean "this file has no such tag".
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TagEdit {
    pub title: String,
    /// One entry per artist, exactly as the scan reads them back.
    pub artists: Vec<String>,
    pub album: String,
    pub album_artist: String,
    pub track_no: Option<u32>,
    pub disc_no: Option<u32>,
    pub year: Option<u32>,
    pub genre: String,
}

fn clean(label: &str, value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.chars().any(char::is_control) {
        return Err(format!("{label} can't contain line breaks."));
    }
    if value.chars().count() > MAX_TEXT {
        return Err(format!("{label} can be up to {MAX_TEXT} characters."));
    }
    Ok(value.to_string())
}

fn number(label: &str, value: Option<u32>, max: u32) -> Result<Option<u32>, String> {
    match value {
        Some(n) if n == 0 || n > max => Err(format!("{label} must be between 1 and {max}.")),
        other => Ok(other),
    }
}

impl TagEdit {
    /// The edit with its text trimmed and blank artists dropped, or why it can't be saved.
    pub fn checked(&self) -> Result<TagEdit, String> {
        if self.artists.len() > MAX_ARTISTS {
            return Err(format!("A song can have up to {MAX_ARTISTS} artists."));
        }
        let artists = self.artists.iter().map(|a| clean("An artist", a)).collect::<Result<Vec<_>, _>>()?;
        Ok(TagEdit {
            title: clean("The title", &self.title)?,
            artists: artists.into_iter().filter(|a| !a.is_empty()).collect(),
            album: clean("The album", &self.album)?,
            album_artist: clean("The album artist", &self.album_artist)?,
            track_no: number("The track number", self.track_no, MAX_TRACK_NO)?,
            disc_no: number("The disc number", self.disc_no, MAX_DISC_NO)?,
            year: number("The year", self.year, MAX_YEAR)?,
            genre: clean("The genre", &self.genre)?,
        })
    }
}

/// The tags in the file itself, without the stand-ins the library shows for missing ones.
pub fn read(path: &Path) -> Result<TagEdit, String> {
    contain(|| {
        let file = lofty::read_from_path(path).map_err(|e| e.to_string())?;
        let Some(tag) = file.primary_tag().or_else(|| file.first_tag()) else { return Ok(TagEdit::default()) };
        let text = |key: ItemKey| tag.get_string(key).map(str::trim).unwrap_or_default().to_string();
        Ok(TagEdit {
            title: text(ItemKey::TrackTitle),
            artists: tag.get_strings(ItemKey::TrackArtist).map(str::trim).filter(|a| !a.is_empty()).map(String::from).collect(),
            album: text(ItemKey::AlbumTitle),
            album_artist: text(ItemKey::AlbumArtist),
            track_no: tag.track(),
            disc_no: tag.disk(),
            year: tag.date().map(|d| u32::from(d.year)),
            genre: text(ItemKey::Genre),
        })
    })
}

fn apply(tag: &mut Tag, edit: &TagEdit) {
    for (key, value) in [
        (ItemKey::TrackTitle, &edit.title),
        (ItemKey::AlbumTitle, &edit.album),
        (ItemKey::AlbumArtist, &edit.album_artist),
        (ItemKey::Genre, &edit.genre),
    ] {
        tag.remove_key(key);
        if !value.is_empty() {
            tag.insert_text(key, value.clone());
        }
    }
    tag.remove_key(ItemKey::TrackArtist);
    for artist in &edit.artists {
        tag.push(TagItem::new(ItemKey::TrackArtist, ItemValue::Text(artist.clone())));
    }
    match edit.track_no {
        Some(n) => tag.set_track(n),
        None => tag.remove_track(),
    }
    match edit.disc_no {
        Some(n) => tag.set_disk(n),
        None => tag.remove_disk(),
    }
    match edit.year {
        None => tag.remove_date(),
        // An unchanged year keeps the month and day the file may also have.
        Some(year) if tag.date().is_some_and(|d| u32::from(d.year) == year) => {}
        Some(year) => tag.set_date(Timestamp { year: year as u16, ..Timestamp::default() }),
    }
}

fn unwritable(e: &std::io::Error) -> String {
    match (e.kind(), e.raw_os_error()) {
        (_, Some(SHARING_VIOLATION | LOCK_VIOLATION)) => "Another program is using that file. Close it there and try again.".into(),
        (std::io::ErrorKind::PermissionDenied, _) => "That file is read-only, so its tags can't be changed.".into(),
        (std::io::ErrorKind::NotFound, _) => "That file isn't there anymore. Rescan your library.".into(),
        _ => format!("The file couldn't be opened for writing ({e})."),
    }
}

/// Reads `file` as format `A`, swaps the edited fields into its tag `T` and saves it in place.
/// shortcut: a file with only a secondary tag (ID3v1 or APE on an MP3, RIFF INFO on a WAV) gets
/// a new primary tag holding just the edited fields; seed it from the old tag if that ever matters.
fn rewrite<A, T>(file: &mut File, edit: &TagEdit, slot: fn(&mut A) -> Option<&mut T>, set: fn(&mut A, T)) -> Result<(), String>
where
    A: AudioFile,
    T: SplitTag + Default,
    T::Remainder: MergeTag<Merged = T>,
{
    let mut audio = A::read_from(file, ParseOptions::new()).map_err(|e| format!("The file's tags couldn't be read ({e})."))?;
    let (rest, mut tag) = slot(&mut audio).map(std::mem::take).unwrap_or_default().split_tag();
    apply(&mut tag, edit);
    set(&mut audio, rest.merge_tag(tag));
    file.rewind().map_err(|e| unwritable(&e))?;
    audio.save_to(file, WriteOptions::default()).map_err(|e| format!("The tags couldn't be saved ({e})."))
}

fn save(path: &Path, file: &mut File, edit: &TagEdit) -> Result<(), String> {
    let probe = Probe::open(path).map_err(|e| format!("The file couldn't be read ({e})."))?;
    let kind = probe.guess_file_type().map_err(|e| unwritable(&e))?.file_type();
    match kind {
        Some(FileType::Mpeg) => rewrite(file, edit, MpegFile::id3v2_mut, |f, t| drop(f.set_id3v2(t))),
        Some(FileType::Aac) => rewrite(file, edit, AacFile::id3v2_mut, |f, t| drop(f.set_id3v2(t))),
        Some(FileType::Wav) => rewrite(file, edit, WavFile::id3v2_mut, |f, t| drop(f.set_id3v2(t))),
        Some(FileType::Flac) => rewrite(file, edit, FlacFile::vorbis_comments_mut, |f, t| drop(f.set_vorbis_comments(t))),
        Some(FileType::Vorbis) => rewrite(file, edit, |f: &mut VorbisFile| Some(f.vorbis_comments_mut()), |f, t| drop(f.set_vorbis_comments(t))),
        Some(FileType::Mp4) => rewrite(file, edit, Mp4File::ilst_mut, |f, t| drop(f.set_ilst(t))),
        _ => Err("Carbon can't edit tags in this kind of file.".into()),
    }
}

/// The working copy's name: the song's own, with this on the end (not an audio extension, so a scan ignores it).
const WORKING_SUFFIX: &str = ".carbon-tmp";

fn working_copy(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(WORKING_SUFFIX);
    path.with_file_name(name)
}

/// Edits the copy at `copy` and makes sure every byte of it has reached the disk.
fn edit_copy(path: &Path, copy: &Path, edit: &TagEdit) -> Result<(), String> {
    std::fs::copy(path, copy).map_err(|e| format!("There wasn't room to save the tags safely ({e})."))?;
    let mut file = OpenOptions::new().read(true).write(true).open(copy).map_err(|e| unwritable(&e))?;
    // lofty parses untrusted bytes: a panic there is an error for this file, not the app.
    contain(|| save(path, &mut file, edit))?;
    file.sync_all().map_err(|e| format!("The tags couldn't be saved ({e})."))
}

/// Writes `edit` (already checked) into the file at `path`, leaving every other tag alone.
///
/// The tag library saves by emptying the file and writing it back, so a full disk, a pulled drive or
/// a crash mid-save would leave an empty song. The edit is therefore made on a copy beside the
/// song, which takes the song's place only once it is complete; any failure leaves the song as it was.
pub fn write(path: &Path, edit: &TagEdit) -> Result<(), String> {
    // Opening for writing first says "read-only" or "in use" in those words, before anything is copied.
    drop(OpenOptions::new().read(true).write(true).open(path).map_err(|e| unwritable(&e))?);
    let copy = working_copy(path);
    let saved = edit_copy(path, &copy, edit).and_then(|()| std::fs::rename(&copy, path).map_err(|e| unwritable(&e)));
    if saved.is_err() {
        let _ = std::fs::remove_file(&copy);
    }
    saved
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::engine::decoder::tests::write_wav;
    use lofty::picture::{MimeType, Picture, PictureType};
    use std::path::PathBuf;

    const COVER: &[u8] = b"\x89PNG\r\n\x1a\nnot really a picture";

    /// "fLaC" and a STREAMINFO block (44.1 kHz stereo 16-bit, one second): all lofty reads.
    pub fn write_flac(path: &Path) {
        let mut bytes = b"fLaC\x80\x00\x00\x22".to_vec();
        bytes.extend_from_slice(&[0x10, 0x00, 0x10, 0x00, 0, 0, 0, 0, 0, 0]); // block and frame sizes
        bytes.extend_from_slice(&[0x0A, 0xC4, 0x42, 0xF0, 0x00, 0x00, 0xAC, 0x44]); // rate, channels, bits, 44100 samples
        bytes.extend_from_slice(&[0; 16]); // MD5
        bytes.extend_from_slice(&[0xFF, 0xF8, 0xC9, 0x18, 0, 0, 0, 0]); // the start of a frame
        std::fs::write(path, bytes).unwrap();
    }

    /// Silent 128 kbps frames behind an ID3v2.4 tag holding one frame no generic field maps to.
    pub fn write_mp3(path: &Path) {
        let body = b"\x03MYFIELD\x00keep me";
        let mut bytes = b"ID3\x04\x00\x00\x00\x00\x00".to_vec();
        bytes.push(10 + body.len() as u8);
        bytes.extend_from_slice(b"TXXX\x00\x00\x00");
        bytes.extend_from_slice(&[body.len() as u8, 0, 0]);
        bytes.extend_from_slice(body);
        for _ in 0..40 {
            bytes.extend_from_slice(&[0xFF, 0xFB, 0x90, 0x00]);
            bytes.extend_from_slice(&[0; 413]);
        }
        std::fs::write(path, bytes).unwrap();
    }

    pub fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("carbon-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn edit() -> TagEdit {
        TagEdit {
            title: "Blue in Green".into(),
            artists: vec!["Miles Davis".into(), "Bill Evans".into()],
            album: "Kind of Blue".into(),
            album_artist: "Miles Davis".into(),
            track_no: Some(3),
            disc_no: Some(1),
            year: Some(1959),
            genre: "Jazz".into(),
        }
    }

    /// Gives the file a cover, a comment and a loudness tag, the way a tagger would have.
    fn seed(path: &Path) {
        let mut file = lofty::read_from_path(path).unwrap();
        let kind = file.primary_tag_type();
        if file.tag(kind).is_none() {
            file.insert_tag(Tag::new(kind));
        }
        let tag = file.tag_mut(kind).unwrap();
        tag.insert_text(ItemKey::Comment, "ripped at home".into());
        tag.insert_text(ItemKey::ReplayGainTrackGain, "-6.20 dB".into());
        tag.insert_text(ItemKey::TrackTitle, "Old title".into());
        tag.push_picture(Picture::unchecked(COVER.to_vec()).pic_type(PictureType::CoverFront).mime_type(MimeType::Png).build());
        file.save_to_path(path, WriteOptions::default()).unwrap();
    }

    fn assert_round_trip(path: &Path) {
        seed(path);
        write(path, &edit()).unwrap();
        assert_eq!(read(path).unwrap(), edit(), "{}", path.display());
        let file = lofty::read_from_path(path).unwrap();
        let tag = file.primary_tag().unwrap();
        assert_eq!(tag.get_string(ItemKey::Comment), Some("ripped at home"));
        assert_eq!(tag.get_string(ItemKey::ReplayGainTrackGain), Some("-6.20 dB"));
        assert_eq!(tag.pictures().first().map(|p| p.data()), Some(COVER));

        // Clearing fields removes their tags and leaves the rest.
        write(path, &TagEdit { title: "Only a title".into(), ..TagEdit::default() }).unwrap();
        assert_eq!(read(path).unwrap(), TagEdit { title: "Only a title".into(), ..TagEdit::default() });
        let file = lofty::read_from_path(path).unwrap();
        assert_eq!(file.primary_tag().unwrap().pictures().len(), 1);
        assert_eq!(file.primary_tag().unwrap().get_string(ItemKey::Comment), Some("ripped at home"));
    }

    #[test]
    fn round_trips_tags_in_wav_flac_and_mp3_keeping_everything_else() {
        let dir = temp_dir("tags");
        write_wav(&dir.join("a.wav"), 8000, 2, 0.2, 0.5);
        write_flac(&dir.join("a.flac"));
        write_mp3(&dir.join("a.mp3"));
        for name in ["a.wav", "a.flac", "a.mp3"] {
            assert_round_trip(&dir.join(name));
        }
        // The WAV still plays: its audio wasn't touched.
        let mut decoder = crate::engine::decoder::Decoder::open(&dir.join("a.wav")).unwrap();
        let mut audio = Vec::new();
        while decoder.next_chunk(&mut audio).unwrap() {}
        assert_eq!(audio.len() / 2, 1600);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn frames_carbon_does_not_know_survive_an_edit() {
        let dir = temp_dir("tags-unknown");
        let mp3 = dir.join("a.mp3");
        write_mp3(&mp3);
        write(&mp3, &edit()).unwrap();
        let read_back = MpegFile::read_from(&mut File::open(&mp3).unwrap(), ParseOptions::new()).unwrap();
        assert_eq!(read_back.id3v2().unwrap().get_user_text("MYFIELD"), Some("keep me"));

        let flac = dir.join("a.flac");
        write_flac(&flac);
        let mut file = OpenOptions::new().read(true).write(true).open(&flac).unwrap();
        let mut audio = FlacFile::read_from(&mut file, ParseOptions::new()).unwrap();
        let mut comments = lofty::ogg::tag::VorbisComments::default();
        comments.push("MYFIELD".into(), "keep me".into());
        audio.set_vorbis_comments(comments);
        file.rewind().unwrap();
        audio.save_to(&mut file, WriteOptions::default()).unwrap();
        drop(file);
        write(&flac, &edit()).unwrap();
        let read_back = FlacFile::read_from(&mut File::open(&flac).unwrap(), ParseOptions::new()).unwrap();
        assert_eq!(read_back.vorbis_comments().unwrap().get("MYFIELD"), Some("keep me"));
        assert_eq!(read(&flac).unwrap().artists, edit().artists);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn an_unchanged_year_keeps_the_full_date() {
        let mut tag = Tag::new(lofty::tag::TagType::VorbisComments);
        tag.insert_text(ItemKey::RecordingDate, "1959-08-17".into());
        apply(&mut tag, &edit());
        assert_eq!(tag.get_string(ItemKey::RecordingDate), Some("1959-08-17"));
        apply(&mut tag, &TagEdit { year: Some(1960), ..edit() });
        assert_eq!(tag.date().map(|d| (d.year, d.month)), Some((1960, None)));
    }

    #[test]
    fn a_save_that_fails_leaves_the_song_untouched_and_no_copy_behind() {
        let dir = temp_dir("failed-save");
        let path = dir.join("song.txt"); // not audio: the save step refuses it after the copy is made
        std::fs::write(&path, b"not really a song").unwrap();
        assert!(write(&path, &edit()).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"not really a song");
        assert!(!working_copy(&path).exists());
        assert!(working_copy(Path::new("C:/music/a.flac")).ends_with("a.flac.carbon-tmp"));
    }

    #[test]
    fn checks_lengths_ranges_and_control_characters() {
        let ok = TagEdit { title: "  Song  ".into(), artists: vec![" A ".into(), "  ".into()], ..edit() }.checked().unwrap();
        assert_eq!((ok.title.as_str(), ok.artists), ("Song", vec!["A".to_string()]));
        assert_eq!(TagEdit::default().checked(), Ok(TagEdit::default()));
        let bad = [
            TagEdit { title: "x".repeat(MAX_TEXT + 1), ..edit() },
            TagEdit { album: "two\nlines".into(), ..edit() },
            TagEdit { artists: vec!["nul\0inside".into()], ..edit() },
            TagEdit { artists: vec!["a".into(); MAX_ARTISTS + 1], ..edit() },
            TagEdit { track_no: Some(0), ..edit() },
            TagEdit { track_no: Some(MAX_TRACK_NO + 1), ..edit() },
            TagEdit { disc_no: Some(MAX_DISC_NO + 1), ..edit() },
            TagEdit { year: Some(MAX_YEAR + 1), ..edit() },
        ];
        for edit in bad {
            assert!(edit.checked().is_err(), "{edit:?}");
        }
        assert!(TagEdit { title: "é".repeat(MAX_TEXT), ..edit() }.checked().is_ok()); // characters, not bytes
    }

    #[test]
    fn explains_files_that_cannot_be_written() {
        let dir = temp_dir("tags-refused");
        assert!(write(&dir.join("missing.mp3"), &edit()).unwrap_err().contains("isn't there anymore"));
        let junk = dir.join("junk.mp3");
        std::fs::write(&junk, b"definitely not audio").unwrap();
        assert!(write(&junk, &edit()).is_err());
        let locked = dir.join("locked.wav");
        write_wav(&locked, 8000, 1, 0.1, 0.5);
        let mut readonly = std::fs::metadata(&locked).unwrap().permissions();
        readonly.set_readonly(true);
        std::fs::set_permissions(&locked, readonly.clone()).unwrap();
        assert!(write(&locked, &edit()).unwrap_err().contains("read-only"));
        #[allow(clippy::permissions_set_readonly_false)]
        readonly.set_readonly(false);
        std::fs::set_permissions(&locked, readonly).unwrap();
        let _ = std::fs::remove_dir_all(dir);
    }
}
