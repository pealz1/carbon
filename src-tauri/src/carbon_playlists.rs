//! Carbon playlists: owned by Carbon, stored locally, and free to mix local files with Spotify
//! tracks (Spotify's API can't add local files to Spotify playlists). Spotify items keep a small
//! snapshot of their metadata so a playlist renders without extra API calls.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const FILE: &str = "carbon-playlists.json";
const MAX_PLAYLISTS: usize = 500;
const MAX_ITEMS: usize = 10_000;
const MAX_NAME: usize = 100;
const MAX_TEXT: usize = 512;
const MAX_ARTISTS: usize = 32;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtistRef {
    pub id: String,
    pub name: String,
    pub uri: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AlbumRef {
    pub id: String,
    pub name: String,
    pub uri: String,
    pub image: Option<String>,
}

/// Same shape as the webview's `Track` view model.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyTrack {
    pub id: String,
    pub uri: String,
    pub name: String,
    pub artists: Vec<ArtistRef>,
    pub album: Option<AlbumRef>,
    pub duration_ms: u64,
    pub explicit: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Item {
    Local { id: String },
    Spotify { track: SpotifyTrack },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub items: Vec<Item>,
    pub updated_ms: u64,
}

fn is_spotify_id(id: &str) -> bool {
    id.len() == 22 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

fn short(text: &str) -> bool {
    text.len() <= MAX_TEXT && !text.chars().any(char::is_control)
}

impl Item {
    fn validate(&self) -> Result<(), String> {
        match self {
            Item::Local { id } if id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit()) => Ok(()),
            Item::Local { .. } => Err("that local song id isn't valid".into()),
            Item::Spotify { track: t } => {
                let uri_ok = t.uri.strip_prefix("spotify:track:").is_some_and(is_spotify_id) && t.uri.ends_with(&t.id);
                let image_ok = t.album.as_ref().and_then(|a| a.image.as_deref()).is_none_or(|i| i.starts_with("https://") && short(i));
                let texts_ok = [&t.name, &t.id].into_iter().all(|s| short(s))
                    && t.artists.iter().all(|a| short(&a.name) && short(&a.id) && short(&a.uri))
                    && t.album.as_ref().is_none_or(|a| short(&a.name) && short(&a.id) && short(&a.uri));
                if uri_ok && image_ok && texts_ok && !t.name.is_empty() && t.artists.len() <= MAX_ARTISTS {
                    Ok(())
                } else {
                    Err("that Spotify track isn't valid".into())
                }
            }
        }
    }
}

pub fn clean_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME || name.chars().any(char::is_control) {
        return Err(format!("Playlist names need 1 to {MAX_NAME} characters."));
    }
    Ok(name.to_string())
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn new_id(name: &str, taken: &[Playlist]) -> String {
    let mut salt = now_ms();
    loop {
        let id = format!("{:x}", md5::compute(format!("{salt}:{name}")))[..16].to_string();
        if taken.iter().all(|p| p.id != id) {
            return id;
        }
        salt += 1;
    }
}

pub struct Store {
    playlists: Mutex<Vec<Playlist>>,
    file: Option<PathBuf>,
}

impl Store {
    pub fn load(app: &AppHandle) -> Store {
        let file = app.path().app_data_dir().ok().map(|d| d.join(FILE));
        let playlists = file
            .as_ref()
            .and_then(|f| fs::read_to_string(f).ok())
            .and_then(|t| serde_json::from_str(&t).map_err(|e| eprintln!("[playlists] {FILE} unreadable: {e}")).ok())
            .unwrap_or_default();
        Store { playlists: Mutex::new(playlists), file }
    }

    /// Applies `change` to a copy and only keeps it if saving succeeds, so a full disk can't
    /// leave memory and disk disagreeing. Writes go to a temp file first, then replace.
    fn update(&self, app: &AppHandle, change: impl FnOnce(&mut Vec<Playlist>) -> Result<(), String>) -> Result<Vec<Playlist>, String> {
        let mut guard = self.playlists.lock().map_err(|e| e.to_string())?;
        let mut next = guard.clone();
        change(&mut next)?;
        if let Some(file) = &self.file {
            if let Some(dir) = file.parent() {
                fs::create_dir_all(dir).map_err(|e| format!("Couldn't save playlists: {e}"))?;
            }
            let tmp = file.with_extension("json.tmp");
            fs::write(&tmp, serde_json::to_vec_pretty(&next).map_err(|e| e.to_string())?).map_err(|e| format!("Couldn't save playlists: {e}"))?;
            fs::rename(&tmp, file).map_err(|e| format!("Couldn't save playlists: {e}"))?;
        }
        *guard = next.clone();
        let _ = app.emit("carbon-playlists-changed", ());
        Ok(next)
    }

    pub fn delete_data(&self) -> Result<(), String> {
        if let Some(file) = &self.file {
            match fs::remove_file(file) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(format!("could not remove playlists: {e}")),
                _ => {}
            }
        }
        if let Ok(mut p) = self.playlists.lock() {
            p.clear();
        }
        Ok(())
    }
}

fn find<'a>(playlists: &'a mut [Playlist], id: &str) -> Result<&'a mut Playlist, String> {
    playlists.iter_mut().find(|p| p.id == id).ok_or_else(|| "That playlist doesn't exist anymore.".to_string())
}

pub fn create(playlists: &mut Vec<Playlist>, name: &str) -> Result<(), String> {
    if playlists.len() >= MAX_PLAYLISTS {
        return Err(format!("Carbon keeps up to {MAX_PLAYLISTS} playlists."));
    }
    let name = clean_name(name)?;
    let id = new_id(&name, playlists);
    playlists.push(Playlist { id, name, items: Vec::new(), updated_ms: now_ms() });
    Ok(())
}

pub fn add(playlists: &mut [Playlist], id: &str, items: Vec<Item>) -> Result<(), String> {
    items.iter().try_for_each(Item::validate)?;
    let p = find(playlists, id)?;
    if p.items.len() + items.len() > MAX_ITEMS {
        return Err(format!("A playlist holds up to {MAX_ITEMS} songs."));
    }
    p.items.extend(items);
    p.updated_ms = now_ms();
    Ok(())
}

pub fn remove(playlists: &mut [Playlist], id: &str, index: usize) -> Result<(), String> {
    let p = find(playlists, id)?;
    if index >= p.items.len() {
        return Err("That song isn't in the playlist anymore.".into());
    }
    p.items.remove(index);
    p.updated_ms = now_ms();
    Ok(())
}

pub fn reorder(playlists: &mut [Playlist], id: &str, from: usize, to: usize) -> Result<(), String> {
    let p = find(playlists, id)?;
    if from >= p.items.len() || to >= p.items.len() {
        return Err("That position is outside the playlist.".into());
    }
    let item = p.items.remove(from);
    p.items.insert(to, item);
    p.updated_ms = now_ms();
    Ok(())
}

#[tauri::command]
pub fn carbon_playlists(store: State<Store>) -> Result<Vec<Playlist>, String> {
    store.playlists.lock().map(|p| p.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn carbon_playlist_create(app: AppHandle, store: State<Store>, name: String) -> Result<Vec<Playlist>, String> {
    store.update(&app, |all| create(all, &name))
}

#[tauri::command]
pub fn carbon_playlist_rename(app: AppHandle, store: State<Store>, id: String, name: String) -> Result<Vec<Playlist>, String> {
    let name = clean_name(&name)?;
    store.update(&app, |all| {
        let p = find(all, &id)?;
        p.name = name;
        p.updated_ms = now_ms();
        Ok(())
    })
}

#[tauri::command]
pub fn carbon_playlist_delete(app: AppHandle, store: State<Store>, id: String) -> Result<Vec<Playlist>, String> {
    store.update(&app, |all| {
        find(all, &id)?;
        all.retain(|p| p.id != id);
        Ok(())
    })
}

#[tauri::command]
pub fn carbon_playlist_add(app: AppHandle, store: State<Store>, id: String, items: Vec<Item>) -> Result<Vec<Playlist>, String> {
    store.update(&app, |all| add(all, &id, items))
}

#[tauri::command]
pub fn carbon_playlist_remove(app: AppHandle, store: State<Store>, id: String, index: usize) -> Result<Vec<Playlist>, String> {
    store.update(&app, |all| remove(all, &id, index))
}

#[tauri::command]
pub fn carbon_playlist_move(app: AppHandle, store: State<Store>, id: String, from: usize, to: usize) -> Result<Vec<Playlist>, String> {
    store.update(&app, |all| reorder(all, &id, from, to))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCAL: &str = "0123456789abcdef0123456789abcdef";

    fn spotify(id: &str) -> Item {
        Item::Spotify {
            track: SpotifyTrack {
                id: id.into(),
                uri: format!("spotify:track:{id}"),
                name: "Song".into(),
                artists: vec![ArtistRef { id: "a".into(), name: "Artist".into(), uri: "spotify:artist:a".into() }],
                album: Some(AlbumRef { id: "b".into(), name: "Album".into(), uri: "spotify:album:b".into(), image: Some("https://i.scdn.co/x".into()) }),
                duration_ms: 1000,
                explicit: false,
            },
        }
    }

    fn one() -> Vec<Playlist> {
        let mut all = Vec::new();
        create(&mut all, "  Mixed  ").unwrap();
        all
    }

    #[test]
    fn creates_with_trimmed_names_and_rejects_bad_ones() {
        let all = one();
        assert_eq!(all[0].name, "Mixed");
        assert_eq!(all[0].id.len(), 16);
        assert!(clean_name("   ").is_err());
        assert!(clean_name(&"x".repeat(101)).is_err());
        assert!(clean_name("tab\there").is_err());
    }

    #[test]
    fn mixes_local_and_spotify_items() {
        let mut all = one();
        let id = all[0].id.clone();
        add(&mut all, &id, vec![Item::Local { id: LOCAL.into() }, spotify("4uLU6hMCjMI75M1A2tKUQC")]).unwrap();
        assert_eq!(all[0].items.len(), 2);
        let json = serde_json::to_string(&all[0].items[0]).unwrap();
        assert_eq!(json, format!(r#"{{"kind":"local","id":"{LOCAL}"}}"#));
    }

    #[test]
    fn validates_items() {
        let mut all = one();
        let id = all[0].id.clone();
        assert!(add(&mut all, &id, vec![Item::Local { id: "../../etc".into() }]).is_err());
        assert!(add(&mut all, &id, vec![spotify("short")]).is_err());
        let mut bad_image = spotify("4uLU6hMCjMI75M1A2tKUQC");
        if let Item::Spotify { track } = &mut bad_image {
            track.album.as_mut().unwrap().image = Some("javascript:alert(1)".into());
        }
        assert!(add(&mut all, &id, vec![bad_image]).is_err());
        assert!(add(&mut all, "missing", vec![]).is_err());
        assert!(all[0].items.is_empty());
    }

    #[test]
    fn removes_and_reorders_within_bounds() {
        let mut all = one();
        let id = all[0].id.clone();
        let items = ["a", "b", "c"].map(|c| Item::Local { id: c.repeat(32) }).to_vec();
        add(&mut all, &id, items).unwrap();
        reorder(&mut all, &id, 0, 2).unwrap();
        let order: Vec<_> = all[0].items.iter().map(|i| if let Item::Local { id } = i { &id[..1] } else { "" }).collect();
        assert_eq!(order, ["b", "c", "a"]);
        assert!(reorder(&mut all, &id, 0, 3).is_err());
        remove(&mut all, &id, 1).unwrap();
        assert_eq!(all[0].items.len(), 2);
        assert!(remove(&mut all, &id, 5).is_err());
    }
}
