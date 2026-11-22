//! Windows' playback devices: which are active, and making one of them the default.
use super::OutputDevice;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::{DEVICE_STATE_ACTIVE, ERole, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, eConsole, eMultimedia, eRender};
use windows::Win32::System::Com::{CLSCTX_ALL, CoCreateInstance, CoIncrementMTAUsage, CoTaskMemFree, STGM_READ};
use windows::core::{BSTR, GUID, HRESULT, HSTRING, IUnknown, IUnknown_Vtbl, Interface, PCWSTR, PWSTR, Result};

const POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

/// Windows documents no way to change the default playback device. Its own Settings page and
/// every device switcher go through this private interface, whose layout has not changed since
/// Windows 7.
#[repr(transparent)]
#[derive(Clone)]
struct IPolicyConfig(IUnknown);

// SAFETY: a COM interface pointer; its method table starts as `IPolicyConfigVtbl` lays it out.
unsafe impl Interface for IPolicyConfig {
    type Vtable = IPolicyConfigVtbl;
    const IID: GUID = GUID::from_u128(0xf8679f50_850a_41cf_9c72_430f290290c8);
}

/// A method Carbon never calls. Only its place in the table matters, so it has no signature.
type Unused = *const c_void;

/// Every method in Windows' own order: `set_default_endpoint` has to sit in exactly its slot.
#[repr(C)]
#[allow(dead_code)] // the unused entries are never read
struct IPolicyConfigVtbl {
    unknown: IUnknown_Vtbl,
    get_mix_format: Unused,
    get_device_format: Unused,
    reset_device_format: Unused,
    set_device_format: Unused,
    get_processing_period: Unused,
    set_processing_period: Unused,
    get_share_mode: Unused,
    set_share_mode: Unused,
    get_property_value: Unused,
    set_property_value: Unused,
    set_default_endpoint: unsafe extern "system" fn(this: *mut c_void, device: PCWSTR, role: ERole) -> HRESULT,
    set_endpoint_visibility: Unused,
}

/// Commands land on whichever worker thread is free, and none of those has set COM up. One
/// reference on the shared apartment, held until Carbon exits, makes COM usable from all of them.
fn com_ready() -> Result<()> {
    static READY: AtomicBool = AtomicBool::new(false);
    if !READY.load(Ordering::Acquire) {
        // SAFETY: no arguments; the returned cookie is deliberately never released.
        unsafe { CoIncrementMTAUsage()? };
        READY.store(true, Ordering::Release);
    }
    Ok(())
}

pub(super) fn enumerator() -> Result<IMMDeviceEnumerator> {
    com_ready()?;
    // SAFETY: a plain COM activation; the interface is owned by the caller.
    unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
}

/// Copies a string Windows allocated for the caller, then frees Windows' copy.
pub(super) fn take(text: PWSTR) -> String {
    if text.is_null() {
        return String::new();
    }
    // SAFETY: Windows returned a zero-terminated string and handed over its ownership.
    unsafe {
        let owned = String::from_utf16_lossy(text.as_wide());
        CoTaskMemFree(Some(text.as_ptr().cast()));
        owned
    }
}

/// The device ordinary sound goes to in `role`; none when Windows has no playback device at all.
pub(super) fn default_id(enumerator: &IMMDeviceEnumerator, role: ERole) -> Option<String> {
    // SAFETY: calls on interfaces owned here; the id string is taken over by `take`.
    unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role).and_then(|device| device.GetId()) }.ok().map(take)
}

fn describe(device: &IMMDevice, default: Option<&str>) -> Result<OutputDevice> {
    // SAFETY: calls on interfaces owned here; the property value frees itself when dropped.
    unsafe {
        let id = take(device.GetId()?);
        let name = BSTR::try_from(&device.OpenPropertyStore(STGM_READ)?.GetValue(&PKEY_Device_FriendlyName)?)?.to_string();
        Ok(OutputDevice { is_default: default == Some(id.as_str()), id, name })
    }
}

/// The default first, then A to Z ignoring case.
fn ordered(mut devices: Vec<OutputDevice>) -> Vec<OutputDevice> {
    devices.sort_by_cached_key(|device| (!device.is_default, device.name.to_lowercase()));
    devices
}

fn read() -> Result<Vec<OutputDevice>> {
    let enumerator = enumerator()?;
    // Music plays to the console role's device: it is the one WebView2 and Carbon's own engine open.
    let default = default_id(&enumerator, eConsole);
    // SAFETY: calls on interfaces owned here.
    unsafe {
        let endpoints = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
        let devices = (0..endpoints.GetCount()?)
            // A device unplugged halfway through is left out instead of failing the whole list.
            .map(|i| endpoints.Item(i).and_then(|device| describe(&device, default.as_deref())))
            .filter_map(|device| device.inspect_err(|e| eprintln!("[output-devices] skipped a device: {e}")).ok())
            .collect();
        Ok(ordered(devices))
    }
}

pub fn list() -> std::result::Result<Vec<OutputDevice>, String> {
    read().map_err(|e| format!("Couldn't read the output devices: {e}"))
}

fn make_default(id: &str) -> Result<()> {
    let id = HSTRING::from(id);
    // SAFETY: `id` outlives both calls, and the method is called with the signature Windows gives it.
    unsafe {
        let policy: IPolicyConfig = CoCreateInstance(&POLICY_CONFIG_CLIENT, None, CLSCTX_ALL)?;
        // Calls and meetings (the communications role) stay on whatever the user chose for them.
        for role in [eConsole, eMultimedia] {
            (policy.vtable().set_default_endpoint)(policy.as_raw(), PCWSTR(id.as_ptr()), role).ok()?;
        }
    }
    Ok(())
}

/// `id` must be one of the devices `list` returns right now.
pub fn select(id: &str) -> std::result::Result<(), String> {
    if !list()?.iter().any(|device| device.id == id) {
        return Err("That output device is no longer available".into());
    }
    make_default(id).map_err(|e| format!("Couldn't switch the output device: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::Media::Audio::eCommunications;

    fn device(name: &str, is_default: bool) -> OutputDevice {
        OutputDevice { id: format!("id-{name}"), name: name.into(), is_default }
    }

    #[test]
    fn puts_the_default_first_then_sorts_by_name_ignoring_case() {
        let sorted = ordered(vec![device("speakers", false), device("Headphones", false), device("TV", true), device("DAC", false)]);
        let names: Vec<&str> = sorted.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(names, ["TV", "DAC", "Headphones", "speakers"]);
    }

    #[test]
    fn keeps_set_default_endpoint_in_its_vtable_slot() {
        // Three IUnknown methods and ten IPolicyConfig methods come before it; one comes after.
        let slot = std::mem::offset_of!(IPolicyConfigVtbl, set_default_endpoint) / size_of::<usize>();
        assert_eq!(slot, 13);
        assert_eq!(size_of::<IPolicyConfigVtbl>(), 15 * size_of::<usize>());
    }

    /// Talks to the real audio stack, so it runs only on request:
    /// `cargo test -- --ignored smoke_real_devices --nocapture`.
    /// It changes nothing: the only device it selects is the one that is already the default.
    /// Nothing is asserted about callbacks, since Windows needn't report a change that isn't one.
    #[test]
    #[ignore]
    fn smoke_real_devices() {
        let before = list().expect("the device list");
        for d in &before {
            println!("{} {} [{}]", if d.is_default { "*" } else { " " }, d.name, d.id);
        }
        let defaults: Vec<&OutputDevice> = before.iter().filter(|d| d.is_default).collect();
        assert_eq!(defaults.len(), 1, "exactly one default device");
        let current = defaults[0].id.clone();

        let enumerator = enumerator().expect("the device enumerator");
        // Selecting sets both roles, so it is only a no-op when this device already holds both.
        assert_eq!(default_id(&enumerator, eMultimedia).as_deref(), Some(current.as_str()), "the console and multimedia defaults differ; selecting would change one of them");
        let communications = default_id(&enumerator, eCommunications);

        let (sender, changes) = std::sync::mpsc::channel();
        let listener = super::super::watcher::listener(sender);
        // SAFETY: the listener is never freed, and is unregistered below anyway.
        unsafe { enumerator.RegisterEndpointNotificationCallback(&listener) }.expect("Windows accepts the listener");

        assert_eq!(select("not a device"), Err("That output device is no longer available".to_string()));
        assert_eq!(select(&current), Ok(()));

        let heard: Vec<bool> = std::iter::from_fn(|| changes.recv_timeout(std::time::Duration::from_millis(700)).ok()).collect();
        println!("callbacks Windows sent for the reselection (true = new default): {heard:?}");
        // SAFETY: as above.
        unsafe { enumerator.UnregisterEndpointNotificationCallback(&listener) }.expect("Windows lets the listener go");

        assert_eq!(list().expect("the device list afterwards"), before);
        assert_eq!(default_id(&enumerator, eMultimedia).as_deref(), Some(current.as_str()));
        assert_eq!(default_id(&enumerator, eCommunications), communications);
        println!("reselected the default through IPolicyConfig: {}", defaults[0].name);

        let claimed = super::super::identity::claim().expect("the identity claim");
        println!("audio sessions labelled as Carbon: {claimed}");
    }
}
