//! The local library: folders the listener added, scanned into an index cached as library.json
//! in the app data directory. Artwork is extracted to the app cache so the webview can show it.
mod cue;
mod scan;
mod tags;

use crate::engine::Engine;
use crate::engine::queue::{Clip, QueueTrack};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};
use tags::TagEdit;
use tauri_plugin_dialog::DialogExt;

/// Not "library.json": that name belongs to playlist folders and tags in the same directory.
const INDEX_FILE: &str = "local-library.json";
const ART_DIR: &str = "artwork";
const MAX_FOLDERS: usize = 32;
/// Bumped when the scan reads more tags, so unchanged files are read again on the next scan.
const TAGS_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalTrack {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub album_artist: String,
    pub track_no: Option<u32>,
    pub disc_no: Option<u32>,
    pub year: Option<u32>,
    pub duration_ms: u64,
    /// Cached cover image on disk, shown through the asset protocol.
    pub artwork: Option<String>,
    pub replay_gain_db: Option<f32>,
    pub replay_peak: Option<f32>,
    pub album_gain_db: Option<f32>,
    pub album_peak: Option<f32>,
    pub size: u64,
    pub modified: u64,
    /// Set when a CUE sheet cuts this track out of a longer file; `path` is that file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clip: Option<Clip>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    pub folders: Vec<String>,
    pub tracks: Vec<LocalTrack>,
    #[serde(default)]
    pub tags_version: u32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryView {
    folders: Vec<String>,
    tracks: Vec<LocalTrack>,
    scanning: bool,
}

pub struct LocalLibrary {
    index: Mutex<Index>,
    scanning: AtomicBool,
    file: Option<PathBuf>,
    art_dir: Option<PathBuf>,
}

impl LocalLibrary {
    pub fn load(app: &AppHandle) -> LocalLibrary {
        let file = app.path().app_data_dir().ok().map(|d| d.join(INDEX_FILE));
        let index = file
            .as_ref()
            .and_then(|f| fs::read_to_string(f).ok())
            .and_then(|t| serde_json::from_str::<Index>(&t).map_err(|e| eprintln!("[library] index unreadable, starting fresh: {e}")).ok())
            .unwrap_or_default();
        let art_dir = app.path().app_cache_dir().ok().map(|d| d.join(ART_DIR));
        LocalLibrary { index: Mutex::new(index), scanning: AtomicBool::new(false), file, art_dir }
    }

    fn view(&self) -> Result<LibraryView, String> {
        let index = self.index.lock().map_err(|e| e.to_string())?;
        Ok(LibraryView { folders: index.folders.clone(), tracks: index.tracks.clone(), scanning: self.scanning.load(Ordering::Acquire) })
    }

    /// Resolves library ids to playable files. Only indexed files can ever reach the engine.
    pub fn queue_tracks(&self, ids: &[String]) -> Result<Vec<QueueTrack>, String> {
        let index = self.index.lock().map_err(|e| e.to_string())?;
        let by_id: HashMap<&str, &LocalTrack> = index.tracks.iter().map(|t| (t.id.as_str(), t)).collect();
        ids.iter()
            .map(|id| {
                let t = by_id.get(id.as_str()).ok_or("Some of these songs aren't in your library anymore. Rescan and try again.")?;
                Ok(QueueTrack {
                    id: t.id.clone(),
                    path: PathBuf::from(&t.path),
                    title: t.title.clone(),
                    replay_gain_db: t.replay_gain_db,
                    replay_peak: t.replay_peak,
                    album_gain_db: t.album_gain_db,
                    album_peak: t.album_peak,
                    clip: t.clip.unwrap_or_default(),
                })
            })
            .collect()
    }

    /// The file behind `id`, if its tags may be edited: indexed, inside a library folder, and
    /// not about to be replaced by a running scan.
    fn editable(&self, id: &str) -> Result<PathBuf, String> {
        if self.scanning.load(Ordering::Acquire) {
            return Err("Carbon is still scanning your library. Try again when it's done.".into());
        }
        let index = self.index.lock().map_err(|e| e.to_string())?;
        let track = index.tracks.iter().find(|t| t.id == id).ok_or("That song isn't in your library anymore. Rescan and try again.")?;
        if track.clip.is_some() {
            return Err("That song's details come from a CUE sheet. Edit the .cue file beside it, then rescan.".into());
        }
        let path = PathBuf::from(&track.path);
        if !index.folders.iter().any(|f| path.starts_with(f)) {
            return Err("That file is outside your library's folders.".into());
        }
        Ok(path)
    }

    /// Reads one file again after its tags changed and swaps it into the index.
    fn reread(&self, path: &Path) -> Result<(), String> {
        let fresh = scan::read_one(path, self.art_dir.as_deref()).map_err(|e| format!("The tags were saved, but the file couldn't be read back ({e}). Rescan your library."))?;
        let mut index = self.index.lock().map_err(|e| e.to_string())?;
        index.tracks = index.tracks.iter().map(|t| if t.id == fresh.id { fresh.clone() } else { t.clone() }).collect();
        self.save(&index);
        Ok(())
    }

    fn save(&self, index: &Index) {
        let Some(file) = &self.file else { return };
        let result = (|| {
            if let Some(dir) = file.parent() {
                fs::create_dir_all(dir)?;
            }
            let tmp = file.with_extension("json.tmp");
            fs::write(&tmp, serde_json::to_vec(index)?)?;
            fs::rename(&tmp, file)
        })();
        if let Err(e) = result {
            eprintln!("[library] couldn't save the index: {e}");
        }
    }

    pub fn delete_data(&self) -> Result<(), String> {
        if let Some(file) = &self.file {
            match fs::remove_file(file) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(format!("could not remove the library index: {e}")),
                _ => {}
            }
        }
        if let Ok(mut index) = self.index.lock() {
            *index = Index::default();
        }
        if let Some(dir) = &self.art_dir {
            let _ = fs::remove_dir_all(dir);
        }
        Ok(())
    }
}

/// Adds `folder` unless it's already covered; drops folders it now contains.
fn add_folder(folders: &[String], folder: &Path) -> Result<Vec<String>, String> {
    if !folder.is_absolute() || !folder.is_dir() {
        return Err("That folder can't be opened.".into());
    }
    if folders.iter().any(|f| folder.starts_with(f)) {
        return Err("That folder is already in your library.".into());
    }
    let mut next: Vec<String> = folders.iter().filter(|f| !Path::new(f).starts_with(folder)).cloned().collect();
    if next.len() >= MAX_FOLDERS {
        return Err(format!("Carbon can watch up to {MAX_FOLDERS} folders."));
    }
    next.push(folder.to_string_lossy().into_owned());
    Ok(next)
}

fn spawn_scan(app: &AppHandle) -> Result<(), String> {
    let library = app.state::<LocalLibrary>();
    if library.scanning.swap(true, Ordering::AcqRel) {
        return Ok(()); // the running scan starts over if the folders changed under it
    }
    let _ = app.emit("local-library-changed", ());
    let handle = app.clone();
    std::thread::Builder::new()
        .name("carbon-library-scan".into())
        .spawn(move || run_scan(&handle))
        .map(|_| ())
        .map_err(|e| {
            library.scanning.store(false, Ordering::Release);
            format!("Couldn't start scanning: {e}")
        })
}

/// Scans until the folder list stops changing underneath it (a folder added mid-scan).
fn run_scan(app: &AppHandle) {
    let library = app.state::<LocalLibrary>();
    loop {
        let Ok((folders, previous)) = library.index.lock().map(|index| {
            // Tracks cut by a CUE sheet are rebuilt from the sheet on every scan.
            let reusable = index.tracks.iter().filter(|t| index.tags_version == TAGS_VERSION && t.clip.is_none());
            (index.folders.clone(), reusable.map(|t| (t.path.clone(), t.clone())).collect::<HashMap<_, _>>())
        }) else {
            break;
        };
        let roots: Vec<PathBuf> = folders.iter().map(PathBuf::from).collect();
        let found = scan::find(&roots);
        let total = found.audio.len();
        let tracks = scan::scan(&found, &previous, library.art_dir.as_deref(), |done| {
            let _ = app.emit("local-library-progress", (done, total));
        });
        let Ok(mut index) = library.index.lock() else { break };
        if index.folders != folders {
            continue;
        }
        index.tracks = tracks;
        index.tags_version = TAGS_VERSION;
        library.save(&index);
        break;
    }
    library.scanning.store(false, Ordering::Release);
    let _ = app.emit("local-library-changed", ());
}

#[tauri::command]
pub fn local_library_get(library: State<LocalLibrary>) -> Result<LibraryView, String> {
    library.view()
}

/// Opens the Windows folder picker. The path comes from the OS dialog, never from the webview.
#[tauri::command]
pub async fn local_library_add_folder(app: AppHandle) -> Result<bool, String> {
    let Some(picked) = app.dialog().file().set_title("Add a music folder").blocking_pick_folder() else { return Ok(false) };
    let folder = picked.into_path().map_err(|_| "That folder can't be opened.".to_string())?;
    {
        let library = app.state::<LocalLibrary>();
        let mut index = library.index.lock().map_err(|e| e.to_string())?;
        index.folders = add_folder(&index.folders, &folder)?;
        library.save(&index);
    }
    spawn_scan(&app)?;
    Ok(true)
}

#[tauri::command]
pub fn local_library_remove_folder(app: AppHandle, library: State<LocalLibrary>, folder: String) -> Result<(), String> {
    {
        let mut index = library.index.lock().map_err(|e| e.to_string())?;
        if !index.folders.contains(&folder) {
            return Err("That folder isn't in your library.".into());
        }
        index.folders.retain(|f| f != &folder);
        index.tracks.retain(|t| !Path::new(&t.path).starts_with(&folder));
        library.save(&index);
    }
    let _ = app.emit("local-library-changed", ());
    Ok(())
}

#[tauri::command]
pub fn local_library_rescan(app: AppHandle) -> Result<(), String> {
    spawn_scan(&app)
}

/// The tags the file itself has, for the editor to start from.
#[tauri::command]
pub async fn local_library_tags(app: AppHandle, id: String) -> Result<TagEdit, String> {
    tags::read(&app.state::<LocalLibrary>().editable(&id)?)
}

/// Writes edited tags into the file behind `id` and refreshes that one track everywhere.
#[tauri::command]
pub async fn local_library_edit_tags(app: AppHandle, id: String, tags: TagEdit) -> Result<(), String> {
    let edit = tags.checked()?;
    let library = app.state::<LocalLibrary>();
    let path = library.editable(&id)?;
    // shortcut: a song that starts in the instant between this check and the write isn't caught.
    if app.state::<Engine>().is_using(&path) {
        return Err("That song is playing. Play something else or stop, then try again.".into());
    }
    tags::write(&path, &edit)?;
    library.reread(&path)?;
    let _ = app.emit("local-library-changed", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::decoder::tests::write_wav;

    fn library(folders: &[&Path], files: &[&Path]) -> LocalLibrary {
        let index = Index {
            folders: folders.iter().map(|f| f.to_string_lossy().into_owned()).collect(),
            tracks: files.iter().map(|f| scan::read_one(f, None).unwrap()).collect(),
            tags_version: TAGS_VERSION,
        };
        LocalLibrary { index: Mutex::new(index), scanning: AtomicBool::new(false), file: None, art_dir: None }
    }

    #[test]
    fn tags_are_edited_only_in_indexed_files_inside_the_folders() {
        let dir = tags::tests::temp_dir("editable");
        let (inside, outside) = (dir.join("Music/a.wav"), dir.join("Other/b.wav"));
        for file in [&inside, &outside] {
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            write_wav(file, 8000, 1, 0.1, 0.5);
        }
        let lib = library(&[&dir.join("Music")], &[&inside, &outside]);
        assert_eq!(lib.editable(&scan::track_id(&inside)), Ok(inside.clone()));
        assert!(lib.editable(&scan::track_id(&outside)).unwrap_err().contains("outside"));
        assert!(lib.editable(&inside.to_string_lossy()).unwrap_err().contains("isn't in your library")); // ids only, never paths

        tags::write(&inside, &TagEdit { title: "Renamed".into(), artists: vec!["A".into(), "B".into()], ..TagEdit::default() }).unwrap();
        lib.reread(&inside).unwrap();
        let tracks = lib.view().unwrap().tracks;
        assert_eq!((tracks[0].title.as_str(), tracks[0].artists.len(), tracks[0].album_artist.as_str()), ("Renamed", 2, "A"));
        assert_eq!((tracks[0].id.as_str(), tracks[1].title.as_str()), (scan::track_id(&inside).as_str(), "b")); // same id; others untouched

        // A CUE track has no tags of its own in the file.
        let cut = LocalTrack { id: "cut".into(), clip: Some(Clip { start_ms: 0, end_ms: Some(50) }), ..tracks[0].clone() };
        lib.index.lock().unwrap().tracks.push(cut);
        assert!(lib.editable("cut").unwrap_err().contains("CUE sheet"));
        assert_eq!(lib.queue_tracks(&["cut".into()]).unwrap()[0].clip, Clip { start_ms: 0, end_ms: Some(50) });
        assert!(lib.queue_tracks(&[scan::track_id(&inside)]).unwrap()[0].clip.is_whole());

        lib.scanning.store(true, Ordering::Release);
        assert!(lib.editable(&scan::track_id(&inside)).unwrap_err().contains("scanning"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn adding_folders_dedupes_and_absorbs_children() {
        let root = std::env::temp_dir().join(format!("carbon-test-{}-folders", std::process::id()));
        let child = root.join("Rock");
        fs::create_dir_all(&child).unwrap();
        let one = add_folder(&[], &child).unwrap();
        assert_eq!(one, vec![child.to_string_lossy().into_owned()]);
        assert!(add_folder(&one, &child).is_err());
        let two = add_folder(&one, &root).unwrap();
        assert_eq!(two, vec![root.to_string_lossy().into_owned()]);
        assert!(add_folder(&two, &child).is_err());
        assert!(add_folder(&[], Path::new("relative/path")).is_err());
        assert!(add_folder(&[], &root.join("missing")).is_err());
        let _ = fs::remove_dir_all(root);
    }
}
