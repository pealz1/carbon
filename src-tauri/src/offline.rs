//! Opt-in local copies of openly licensed Internet Archive recordings.
use reqwest::{Client, Url, redirect::Policy};
use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

const ITEM_LIMIT: u64 = 512 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 2 * 1024 * 1024 * 1024;
#[derive(Default)]
pub struct Downloads(Mutex<()>);
#[derive(Serialize)]
pub struct File {
    name: String,
    bytes: u64,
}
#[derive(Serialize)]
pub struct Storage {
    files: Vec<File>,
    used: u64,
    limit: u64,
}
fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("Offline audio");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}
fn storage(root: &Path) -> Result<Storage, String> {
    let mut files = Vec::new();
    let mut used = 0;
    for item in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = item.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let bytes = entry.metadata().map_err(|e| e.to_string())?.len();
        used += bytes;
        files.push(File { name, bytes });
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Storage { files, used, limit: TOTAL_LIMIT })
}
fn public_license(s: &str) -> bool {
    Url::parse(s).is_ok_and(|u| {
        matches!(u.scheme(), "http" | "https")
            && u.host_str() == Some("creativecommons.org")
            && (u.path().starts_with("/licenses/") || u.path().starts_with("/publicdomain/"))
    })
}
fn archive_host(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.host_str().is_some_and(|h| h == "archive.org" || h.ends_with(".archive.org"))
}
fn client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(180))
        .redirect(Policy::custom(|a| if a.previous().len() < 6 && archive_host(a.url()) { a.follow() } else { a.stop() }))
        .build()
        .map_err(|e| e.to_string())
}
fn item_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 200
        && id != "."
        && id != ".."
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}
fn audio(name: &str) -> bool {
    !name.contains(['/', '\\', ':'])
        && name.len() <= 250
        && !name.chars().any(char::is_control)
        && Path::new(name)
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| ["mp3", "ogg", "flac", "wav", "m4a"].contains(&s.to_ascii_lowercase().as_str()))
}
fn offered(meta: &Value) -> bool {
    let license = &meta["metadata"]["licenseurl"];
    (license.as_str().is_some_and(public_license)
        || license.as_array().is_some_and(|a| a.iter().filter_map(Value::as_str).any(public_license)))
        && meta["is_dark"] != true
        && meta["metadata"]["access-restricted-item"] != true
        && meta["metadata"]["access-restricted-item"] != "true"
        && meta["metadata"]["nodownload"] != "true"
        && meta["metadata"]["nodownload"] != true
}
async fn files(http: &Client, id: &str) -> Result<Vec<String>, String> {
    if !item_id(id) {
        return Err("Invalid archive item.".into());
    }
    let bytes = crate::soundcloud::body(
        http.get(format!("https://archive.org/metadata/{id}")).send().await,
        "Internet Archive",
        8 * 1024 * 1024,
    )
    .await?;
    let meta = crate::soundcloud::parse(&bytes, "Internet Archive")?;
    if !offered(&meta) {
        return Ok(vec![]);
    }
    Ok(meta["files"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|f| f["private"] != true && f["private"] != "true")
        .filter_map(|f| f["name"].as_str())
        .filter(|s| audio(s))
        .map(str::to_owned)
        .collect())
}
#[tauri::command]
pub async fn offline_available(id: String) -> Result<Vec<String>, String> {
    files(&client()?, &id).await
}
#[tauri::command]
pub fn offline_storage(app: AppHandle) -> Result<Storage, String> {
    storage(&folder(&app)?)
}
#[tauri::command]
pub async fn offline_save(app: AppHandle, downloads: State<'_, Downloads>, id: String, name: String) -> Result<Storage, String> {
    let _guard = downloads.0.lock().await;
    let http = client()?;
    if !files(&http, &id).await?.contains(&name) {
        return Err("This file is unavailable for offline saving.".into());
    }
    let root = folder(&app)?;
    let available = TOTAL_LIMIT.saturating_sub(storage(&root)?.used).min(ITEM_LIMIT);
    let title: String = Path::new(&name)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .chars()
        .take(55)
        .map(|c| if c.is_alphanumeric() || c == ' ' { c } else { '_' })
        .collect();
    let ext = Path::new(&name).extension().and_then(|s| s.to_str()).unwrap_or("mp3");
    let dest = root.join(format!("{title} - {:x}.{ext}", md5::compute(format!("{id}/{name}"))));
    if !dest.exists() {
        let mut url = Url::parse("https://archive.org/download/").unwrap();
        url.path_segments_mut().unwrap().pop_if_empty().push(&id).push(&name);
        let mut response = http.get(url).send().await.map_err(|_| "Could not reach Internet Archive.")?;
        if !response.status().is_success() {
            return Err("Internet Archive could not deliver the selected file.".into());
        }
        let expected_size = response.content_length();
        if expected_size.is_some_and(|n| n > available) {
            return Err("This download exceeds the offline storage limit.".into());
        }
        let part = root.join(".download-part");
        let result = async {
            let mut file = fs::File::create(&part).map_err(|e| e.to_string())?;
            let mut size = 0;
            while let Some(chunk) = response.chunk().await.map_err(|_| "Download interrupted.")? {
                size += chunk.len() as u64;
                if size > available {
                    return Err("This download exceeds the offline storage limit.".to_string());
                }
                file.write_all(&chunk).map_err(|e| e.to_string())?;
            }
            if size == 0 || expected_size.is_some_and(|n| n != size) {
                return Err("Incomplete audio file.".into());
            }
            file.sync_all().map_err(|e| e.to_string())?;
            drop(file);
            fs::rename(&part, &dest).map_err(|e| e.to_string())
        }
        .await;
        if result.is_err() {
            let _ = fs::remove_file(&part);
        }
        result?;
    }
    crate::local_library::include_offline(&app, &root)?;
    storage(&root)
}
#[tauri::command]
pub async fn offline_remove(app: AppHandle, downloads: State<'_, Downloads>, name: String) -> Result<Storage, String> {
    let _guard = downloads.0.lock().await;
    let root = folder(&app)?;
    if !storage(&root)?.files.iter().any(|f| f.name == name) {
        return Err("Unknown offline file.".into());
    }
    fs::remove_file(root.join(name)).map_err(|e| e.to_string())?;
    crate::local_library::local_library_rescan(app)?;
    storage(&root)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn downloads_only_explicit_public_audio() {
        assert!(offered(&serde_json::json!({"metadata":{"licenseurl":"https://creativecommons.org/publicdomain/zero/1.0/"}})));
        assert!(!offered(
            &serde_json::json!({"metadata":{"licenseurl":"https://creativecommons.org.fake.test/licenses/by/4.0/"}})
        ));
        assert!(!offered(
            &serde_json::json!({"metadata":{"licenseurl":"https://creativecommons.org/licenses/by/4.0/","nodownload":"true"}})
        ));
        assert!(!item_id(".."));
        assert!(!audio("../song.mp3"));
        assert!(audio("Example - 01.flac"));
    }
}
