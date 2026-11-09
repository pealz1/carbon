//! The local library: folders the listener added, scanned into an index cached as library.json
//! in the app data directory. Artwork is extracted to the app cache so the webview can show it.
mod scan;

use crate::engine::queue::QueueTrack;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

const INDEX_FILE: &str = "library.json";
const ART_DIR: &str = "artwork";
const MAX_FOLDERS: usize = 32;

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
    pub size: u64,
    pub modified: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    pub folders: Vec<String>,
    pub tracks: Vec<LocalTrack>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryView {
    folders: Vec<String>,
    tracks: Vec<LocalTrack>,
    scanning: bool,
}

pub struct Library {
    index: Mutex<Index>,
    scanning: AtomicBool,
    file: Option<PathBuf>,
    art_dir: Option<PathBuf>,
}

impl Library {
    pub fn load(app: &AppHandle) -> Library {
        let file = app.path().app_data_dir().ok().map(|d| d.join(INDEX_FILE));
        let index = file
            .as_ref()
            .and_then(|f| fs::read_to_string(f).ok())
            .and_then(|t| serde_json::from_str::<Index>(&t).map_err(|e| eprintln!("[library] index unreadable, starting fresh: {e}")).ok())
            .unwrap_or_default();
        let art_dir = app.path().app_cache_dir().ok().map(|d| d.join(ART_DIR));
        Library { index: Mutex::new(index), scanning: AtomicBool::new(false), file, art_dir }
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
                })
            })
            .collect()
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
    let library = app.state::<Library>();
    if library.scanning.swap(true, Ordering::AcqRel) {
        return Ok(()); // the running scan starts over if the folders changed under it
    }
    let _ = app.emit("library-changed", ());
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
    let library = app.state::<Library>();
    loop {
        let Ok((folders, previous)) = library.index.lock().map(|index| {
            (index.folders.clone(), index.tracks.iter().map(|t| (t.path.clone(), t.clone())).collect::<HashMap<_, _>>())
        }) else {
            break;
        };
        let roots: Vec<PathBuf> = folders.iter().map(PathBuf::from).collect();
        let files = scan::find_audio(&roots);
        let total = files.len();
        let tracks = scan::scan(&files, &previous, library.art_dir.as_deref(), |done| {
            let _ = app.emit("library-progress", (done, total));
        });
        let Ok(mut index) = library.index.lock() else { break };
        if index.folders != folders {
            continue;
        }
        index.tracks = tracks;
        library.save(&index);
        break;
    }
    library.scanning.store(false, Ordering::Release);
    let _ = app.emit("library-changed", ());
}

#[tauri::command]
pub fn library_get(library: State<Library>) -> Result<LibraryView, String> {
    library.view()
}

/// Opens the Windows folder picker. The path comes from the OS dialog, never from the webview.
#[tauri::command]
pub async fn library_add_folder(app: AppHandle) -> Result<bool, String> {
    let Some(picked) = app.dialog().file().set_title("Add a music folder").blocking_pick_folder() else { return Ok(false) };
    let folder = picked.into_path().map_err(|_| "That folder can't be opened.".to_string())?;
    {
        let library = app.state::<Library>();
        let mut index = library.index.lock().map_err(|e| e.to_string())?;
        index.folders = add_folder(&index.folders, &folder)?;
        library.save(&index);
    }
    spawn_scan(&app)?;
    Ok(true)
}

#[tauri::command]
pub fn library_remove_folder(app: AppHandle, library: State<Library>, folder: String) -> Result<(), String> {
    {
        let mut index = library.index.lock().map_err(|e| e.to_string())?;
        if !index.folders.contains(&folder) {
            return Err("That folder isn't in your library.".into());
        }
        index.folders.retain(|f| f != &folder);
        index.tracks.retain(|t| !Path::new(&t.path).starts_with(&folder));
        library.save(&index);
    }
    let _ = app.emit("library-changed", ());
    Ok(())
}

#[tauri::command]
pub fn library_rescan(app: AppHandle) -> Result<(), String> {
    spawn_scan(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

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
