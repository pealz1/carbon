//! Carbon's place in Windows' sound settings: its name and icon in the volume mixer, and the
//! playback devices with a way to change which one is the default. Other systems label apps and
//! switch outputs in their own settings, so there the commands answer without doing anything.
use serde::Serialize;
use tauri::AppHandle;

#[cfg(windows)]
mod devices;
#[cfg(windows)]
mod identity;
#[cfg(windows)]
mod watcher;
#[cfg(windows)]
use {
    devices::{list, select},
    identity::claim,
    watcher::start,
};

#[cfg(not(windows))]
mod unsupported {
    pub fn list() -> Result<Vec<super::OutputDevice>, String> {
        Ok(Vec::new())
    }

    pub fn select(_id: &str) -> Result<(), String> {
        Err("Output switching is only available on Windows".into())
    }

    pub fn claim() -> Result<u32, String> {
        Ok(0)
    }

    pub fn start(_app: tauri::AppHandle) {}
}
#[cfg(not(windows))]
use unsupported::{claim, list, select, start};

/// Carries the fresh device list each time Windows adds, removes or switches a playback device.
#[cfg(windows)]
const CHANGED_EVENT: &str = "output-devices-changed";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevice {
    /// Windows' own id for the endpoint. Opaque: hand it back to `output_device_select` unchanged.
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// Playback devices that are plugged in and enabled: the default first, then A to Z.
#[tauri::command]
pub async fn output_devices() -> Result<Vec<OutputDevice>, String> {
    list()
}

/// Makes a device from `output_devices` the default output for all of Windows, not only Carbon.
#[tauri::command]
pub async fn output_device_select(id: String) -> Result<(), String> {
    select(&id)
}

/// Puts Carbon's name and icon on its entries in the volume mixer. Returns how many entries carry
/// them afterwards: 0 means Windows has none for Carbon yet, because nothing has played. Windows
/// forgets the label when an entry goes away, so call this again whenever playback starts.
#[tauri::command]
pub async fn audio_identity_claim() -> Result<u32, String> {
    claim()
}

/// Call once at startup: from then on `output-devices-changed` follows Windows' device changes.
pub fn watch(app: &AppHandle) {
    start(app.clone());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reaches_the_interface_in_camel_case() {
        let device = OutputDevice { id: "{0.0.0.00000000}.{a}".into(), name: "Speakers".into(), is_default: true };
        let json = serde_json::to_value(device).expect("serialises");
        assert_eq!(json, serde_json::json!({ "id": "{0.0.0.00000000}.{a}", "name": "Speakers", "isDefault": true }));
    }
}
