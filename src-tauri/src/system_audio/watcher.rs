//! Tells the interface when Windows' playback devices change: one is plugged in, unplugged,
//! disabled, or becomes the default.
use super::{CHANGED_EVENT, devices, identity};
use std::ffi::c_void;
use std::sync::Once;
use std::sync::mpsc::{Receiver, Sender, channel};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{E_NOINTERFACE, E_POINTER, PROPERTYKEY, S_OK};
use windows::Win32::Media::Audio::{DEVICE_STATE, EDataFlow, ERole, IMMNotificationClient, IMMNotificationClient_Vtbl, eCommunications, eRender};
use windows::core::{GUID, HRESULT, IUnknown, IUnknown_Vtbl, Interface, PCWSTR, Result};

/// Windows reports one change as several callbacks (a state, then a default for each role), so
/// the list goes out once they have stopped for this long.
const SETTLE: Duration = Duration::from_millis(300);

/// The object Windows calls back, on threads of its own. A COM object is a pointer to its method
/// table, so that comes first. Each callback only posts to the watcher thread: `true` when the
/// default playback device changed.
#[repr(C)]
struct Listener {
    methods: &'static IMMNotificationClient_Vtbl,
    changes: Sender<bool>,
}

// Written out by hand because the `implement` macro only compiles with `windows-core` as a
// dependency of Carbon itself.
static METHODS: IMMNotificationClient_Vtbl = IMMNotificationClient_Vtbl {
    base__: IUnknown_Vtbl { QueryInterface: query_interface, AddRef: stay, Release: stay },
    OnDeviceStateChanged: on_state_changed,
    OnDeviceAdded: on_added_or_removed,
    OnDeviceRemoved: on_added_or_removed,
    OnDefaultDeviceChanged: on_default_changed,
    OnPropertyValueChanged: on_property_changed,
};

/// The listener is leaked on purpose: Windows keeps calling it until Carbon exits, so there is
/// never a moment to free it and its reference count decides nothing.
pub(super) fn listener(changes: Sender<bool>) -> IMMNotificationClient {
    let object: &'static Listener = Box::leak(Box::new(Listener { methods: &METHODS, changes }));
    // SAFETY: `object` begins with a pointer to an IMMNotificationClient method table and lives forever.
    unsafe { IMMNotificationClient::from_raw(std::ptr::from_ref(object).cast_mut().cast()) }
}

unsafe extern "system" fn query_interface(this: *mut c_void, iid: *const GUID, out: *mut *mut c_void) -> HRESULT {
    if iid.is_null() || out.is_null() {
        return E_POINTER;
    }
    // SAFETY: both pointers were checked, and the caller keeps them valid for this call.
    unsafe {
        let known = *iid == IUnknown::IID || *iid == IMMNotificationClient::IID;
        *out = if known { this } else { std::ptr::null_mut() };
        if known { S_OK } else { E_NOINTERFACE }
    }
}

/// Stands in for both AddRef and Release; see `listener`.
unsafe extern "system" fn stay(_this: *mut c_void) -> u32 {
    1
}

/// # Safety
/// `this` must be the pointer Windows was given: the `Listener` leaked in `listener`.
unsafe fn post(this: *mut c_void, default_changed: bool) -> HRESULT {
    // SAFETY: guaranteed by the caller; that object is never freed.
    let listener = unsafe { &*this.cast::<Listener>() };
    // Sending only fails once the watcher thread is gone, and then nobody is left to tell.
    let _ = listener.changes.send(default_changed);
    S_OK
}

unsafe extern "system" fn on_state_changed(this: *mut c_void, _id: PCWSTR, _state: DEVICE_STATE) -> HRESULT {
    // SAFETY: Windows passes back the listener it was registered with.
    unsafe { post(this, false) }
}

unsafe extern "system" fn on_added_or_removed(this: *mut c_void, _id: PCWSTR) -> HRESULT {
    // SAFETY: Windows passes back the listener it was registered with.
    unsafe { post(this, false) }
}

unsafe extern "system" fn on_default_changed(this: *mut c_void, flow: EDataFlow, role: ERole, _id: PCWSTR) -> HRESULT {
    // Microphones and the device for calls don't change where music plays.
    if flow != eRender || role == eCommunications {
        return S_OK;
    }
    // SAFETY: Windows passes back the listener it was registered with.
    unsafe { post(this, true) }
}

unsafe extern "system" fn on_property_changed(_this: *mut c_void, _id: PCWSTR, _key: PROPERTYKEY) -> HRESULT {
    S_OK
}

/// Swallows the callbacks that follow `first` until none has come for `quiet`. True when any of
/// them was a change of default.
fn settle(changes: &Receiver<bool>, first: bool, quiet: Duration) -> bool {
    let mut default_changed = first;
    while let Ok(more) = changes.recv_timeout(quiet) {
        default_changed |= more;
    }
    default_changed
}

fn publish(app: &AppHandle, default_changed: bool) {
    match devices::list() {
        Ok(list) => {
            if let Err(e) = app.emit(CHANGED_EVENT, list) {
                eprintln!("[output-devices] couldn't announce the device change: {e}");
            }
        }
        Err(e) => eprintln!("[output-devices] {e}"),
    }
    // Sound moving to another device opens new sessions there, without Carbon's name on them.
    if default_changed && let Err(e) = identity::claim() {
        eprintln!("[audio-identity] {e}");
    }
}

fn run(app: &AppHandle) -> Result<()> {
    let (sender, changes) = channel();
    let enumerator = devices::enumerator()?;
    let listener = listener(sender);
    // SAFETY: the enumerator lives until this thread ends, and it only ends with Carbon: the
    // leaked listener holds the sender, so the loop below never runs out.
    unsafe { enumerator.RegisterEndpointNotificationCallback(&listener)? };
    while let Ok(first) = changes.recv() {
        publish(app, settle(&changes, first, SETTLE));
    }
    Ok(())
}

/// Starts the one thread that watches for device changes; later calls do nothing.
pub fn start(app: AppHandle) {
    static STARTED: Once = Once::new();
    STARTED.call_once(|| {
        let watcher = std::thread::Builder::new().name("output-devices".into()).spawn(move || {
            if let Err(e) = run(&app) {
                eprintln!("[output-devices] not watching for device changes: {e}");
            }
        });
        if let Err(e) = watcher {
            eprintln!("[output-devices] couldn't start watching for device changes: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUIET: Duration = Duration::from_millis(20);

    #[test]
    fn folds_a_burst_of_callbacks_into_one_answer() {
        let (sender, changes) = channel();
        for default_changed in [false, true, false] {
            sender.send(default_changed).expect("the receiver is alive");
        }
        assert!(settle(&changes, false, QUIET));
        assert!(changes.try_recv().is_err(), "nothing left for a second announcement");
    }

    #[test]
    fn reports_no_new_default_when_only_devices_came_and_went() {
        let (sender, changes) = channel();
        sender.send(false).expect("the receiver is alive");
        assert!(!settle(&changes, false, QUIET));
        assert!(settle(&changes, true, QUIET));
    }

    #[test]
    fn hands_each_callback_to_the_watcher_thread() {
        let (sender, changes) = channel();
        let listener = listener(sender);
        // SAFETY: calls into the listener defined above; the null ids are never read.
        unsafe {
            listener.OnDeviceAdded(PCWSTR::null()).expect("added");
            listener.OnDefaultDeviceChanged(eRender, eCommunications, PCWSTR::null()).expect("calls default");
            listener.OnDefaultDeviceChanged(eRender, windows::Win32::Media::Audio::eConsole, PCWSTR::null()).expect("default");
        }
        assert_eq!(changes.try_iter().collect::<Vec<bool>>(), [false, true]);
        assert!(listener.cast::<IUnknown>().is_ok());
        assert!(listener.cast::<windows::Win32::Media::Audio::IMMDeviceEnumerator>().is_err());
    }
}
