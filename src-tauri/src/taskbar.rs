//! Taskbar thumbnail buttons: previous, play/pause and next under Carbon's taskbar preview.
//! Windows reports a click to the main window as WM_COMMAND, so its window procedure is subclassed
//! to catch them; they become the same media commands as the media keys. The glyphs are drawn
//! here from the shapes of Carbon's own icons.
#[cfg(windows)]
pub use win::{attach, set_playing};

#[cfg(not(windows))]
pub fn attach(_app: &tauri::AppHandle, _window: &tauri::WebviewWindow) {}
#[cfg(not(windows))]
pub fn set_playing(_app: &tauri::AppHandle, _playing: bool) {}

/// A filled shape on the 24-unit grid of Carbon's icon set.
#[derive(Clone, Copy, Debug)]
enum Shape {
    Triangle([(f32, f32); 3]),
    Rect { left: f32, top: f32, right: f32, bottom: f32 },
}

const PREVIOUS: &[Shape] = &[Shape::Triangle([(18.0, 5.5), (18.0, 18.5), (9.0, 12.0)]), Shape::Rect { left: 5.5, top: 5.0, right: 7.75, bottom: 19.0 }];
const PLAY: &[Shape] = &[Shape::Triangle([(8.0, 5.0), (8.0, 19.0), (19.5, 12.0)])];
const PAUSE: &[Shape] = &[Shape::Rect { left: 7.0, top: 5.0, right: 10.2, bottom: 19.0 }, Shape::Rect { left: 13.8, top: 5.0, right: 17.0, bottom: 19.0 }];
const NEXT: &[Shape] = &[Shape::Triangle([(6.0, 5.5), (6.0, 18.5), (15.0, 12.0)]), Shape::Rect { left: 16.25, top: 5.0, right: 18.5, bottom: 19.0 }];

const GRID: f32 = 24.0;
const SAMPLES: u32 = 4;

fn covers(shape: &Shape, x: f32, y: f32) -> bool {
    match *shape {
        Shape::Rect { left, top, right, bottom } => (left..right).contains(&x) && (top..bottom).contains(&y),
        Shape::Triangle([a, b, c]) => {
            let side = |p: (f32, f32), q: (f32, f32)| (q.0 - p.0) * (y - p.1) - (q.1 - p.1) * (x - p.0);
            let (d1, d2, d3) = (side(a, b), side(b, c), side(c, a));
            (d1 >= 0.0 && d2 >= 0.0 && d3 >= 0.0) || (d1 <= 0.0 && d2 <= 0.0 && d3 <= 0.0)
        }
    }
}

/// `size` x `size` BGRA pixels (straight alpha), each supersampled 4 x 4 for smooth edges.
fn rasterize(shapes: &[Shape], size: u32, rgb: [u8; 3]) -> Vec<u8> {
    let scale = GRID / size as f32;
    let mut pixels = Vec::with_capacity((size * size * 4) as usize);
    for py in 0..size {
        for px in 0..size {
            let mut hits = 0;
            for sy in 0..SAMPLES {
                for sx in 0..SAMPLES {
                    let x = (px as f32 + (sx as f32 + 0.5) / SAMPLES as f32) * scale;
                    let y = (py as f32 + (sy as f32 + 0.5) / SAMPLES as f32) * scale;
                    hits += u32::from(shapes.iter().any(|s| covers(s, x, y)));
                }
            }
            let alpha = (hits * 255 / (SAMPLES * SAMPLES)) as u8;
            pixels.extend_from_slice(&[rgb[2], rgb[1], rgb[0], alpha]);
        }
    }
    pixels
}

#[cfg(windows)]
mod win {
    use super::{rasterize, Shape, NEXT, PAUSE, PLAY, PREVIOUS};
    use crate::media_controls::{emit, MediaCommand};
    use std::cell::RefCell;
    use std::sync::OnceLock;
    use tauri::{AppHandle, WebviewWindow};
    use windows::core::{w, Result};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_ENABLED, THBN_CLICKED, THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{ChangeWindowMessageFilterEx, CreateIcon, GetSystemMetrics, RegisterWindowMessageW, HICON, MSGFLT_ALLOW, SM_CXSMICON, WM_COMMAND};

    const SUBCLASS_ID: usize = 0xCA4B;
    const PREVIOUS_ID: u32 = 1;
    const TOGGLE_ID: u32 = 2;
    const NEXT_ID: u32 = 3;
    const LIGHT_GLYPH: [u8; 3] = [0xef, 0xef, 0xe6];
    const DARK_GLYPH: [u8; 3] = [0x10, 0x10, 0x0d];

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static BUTTON_CREATED: OnceLock<u32> = OnceLock::new();

    struct Icons {
        previous: HICON,
        play: HICON,
        pause: HICON,
        next: HICON,
    }

    /// Lives on the main thread, where the window procedure runs.
    #[derive(Default)]
    struct Bar {
        list: Option<(ITaskbarList3, HWND)>,
        icons: Option<Icons>,
        playing: bool,
    }

    thread_local! {
        static BAR: RefCell<Bar> = RefCell::new(Bar::default());
    }

    /// Light glyphs on Windows' dark taskbar, dark ones on its light theme.
    fn glyph_colour() -> [u8; 3] {
        let mut light = 0u32;
        let mut size = size_of::<u32>() as u32;
        let read = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
                w!("SystemUsesLightTheme"),
                RRF_RT_REG_DWORD,
                None,
                Some((&raw mut light).cast()),
                Some(&mut size),
            )
        };
        if read.is_ok() && light == 1 { DARK_GLYPH } else { LIGHT_GLYPH }
    }

    fn icon(shapes: &[Shape], size: u32, rgb: [u8; 3]) -> Result<HICON> {
        let colour = rasterize(shapes, size, rgb);
        // The alpha channel decides transparency; the AND mask only has to exist.
        let mask = vec![0u8; size.div_ceil(16) as usize * 2 * size as usize];
        unsafe { CreateIcon(None, size as i32, size as i32, 1, 32, mask.as_ptr(), colour.as_ptr()) }
    }

    fn make_icons() -> Result<Icons> {
        let size = u32::try_from(unsafe { GetSystemMetrics(SM_CXSMICON) }).ok().filter(|s| *s > 0).unwrap_or(16);
        let rgb = glyph_colour();
        Ok(Icons { previous: icon(PREVIOUS, size, rgb)?, play: icon(PLAY, size, rgb)?, pause: icon(PAUSE, size, rgb)?, next: icon(NEXT, size, rgb)? })
    }

    fn button(id: u32, icon: HICON, tip: &str) -> THUMBBUTTON {
        let mut button = THUMBBUTTON { dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS, iId: id, hIcon: icon, dwFlags: THBF_ENABLED, ..Default::default() };
        let room = button.szTip.len() - 1; // keeps the terminating zero
        for (slot, unit) in button.szTip.iter_mut().zip(tip.encode_utf16().take(room)) {
            *slot = unit;
        }
        button
    }

    fn buttons(icons: &Icons, playing: bool) -> [THUMBBUTTON; 3] {
        [
            button(PREVIOUS_ID, icons.previous, "Previous"),
            if playing { button(TOGGLE_ID, icons.pause, "Pause") } else { button(TOGGLE_ID, icons.play, "Play") },
            button(NEXT_ID, icons.next, "Next"),
        ]
    }

    /// Explorer has made (or, after a restart, remade) Carbon's taskbar button.
    fn add_buttons(hwnd: HWND) -> Result<()> {
        let list: ITaskbarList3 = unsafe { CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)? };
        unsafe { list.HrInit()? };
        BAR.with_borrow_mut(|bar| {
            if bar.icons.is_none() {
                bar.icons = Some(make_icons()?);
            }
            if let Some(icons) = &bar.icons {
                unsafe { list.ThumbBarAddButtons(hwnd, &buttons(icons, bar.playing))? };
            }
            bar.list = Some((list, hwnd));
            Ok(())
        })
    }

    unsafe extern "system" fn subclass(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
        if BUTTON_CREATED.get() == Some(&msg) {
            if let Err(e) = add_buttons(hwnd) {
                eprintln!("[taskbar] couldn't add the buttons: {e}");
            }
        } else if msg == WM_COMMAND && ((wparam.0 >> 16) & 0xffff) as u32 == THBN_CLICKED {
            let command = match (wparam.0 & 0xffff) as u32 {
                PREVIOUS_ID => Some(MediaCommand::Previous),
                TOGGLE_ID => Some(MediaCommand::Toggle),
                NEXT_ID => Some(MediaCommand::Next),
                _ => None,
            };
            if let (Some(app), Some(command)) = (APP.get(), command) {
                emit(app, command);
            }
        }
        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    /// Call on the main thread before the main window is first shown.
    pub fn attach(app: &AppHandle, window: &WebviewWindow) {
        let hwnd = match window.hwnd() {
            Ok(hwnd) => HWND(hwnd.0),
            Err(e) => return eprintln!("[taskbar] no window handle: {e}"),
        };
        let _ = APP.set(app.clone());
        let created = *BUTTON_CREATED.get_or_init(|| unsafe { RegisterWindowMessageW(w!("TaskbarButtonCreated")) });
        unsafe {
            // Lets Explorer reach Carbon even if it runs elevated.
            let _ = ChangeWindowMessageFilterEx(hwnd, created, MSGFLT_ALLOW, None);
            let _ = ChangeWindowMessageFilterEx(hwnd, WM_COMMAND, MSGFLT_ALLOW, None);
            if !SetWindowSubclass(hwnd, Some(subclass), SUBCLASS_ID, 0).as_bool() {
                eprintln!("[taskbar] couldn't watch the main window for button clicks");
            }
        }
    }

    /// Shows pause while playing and play while paused.
    pub fn set_playing(app: &AppHandle, playing: bool) {
        let result = app.run_on_main_thread(move || {
            BAR.with_borrow_mut(|bar| {
                if bar.playing == playing {
                    return;
                }
                bar.playing = playing;
                if let (Some((list, hwnd)), Some(icons)) = (&bar.list, &bar.icons)
                    && let Err(e) = unsafe { list.ThumbBarUpdateButtons(*hwnd, &buttons(icons, playing)) }
                {
                    eprintln!("[taskbar] couldn't update the play button: {e}");
                }
            });
        });
        if let Err(e) = result {
            eprintln!("[taskbar] {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alpha(pixels: &[u8], size: u32, x: u32, y: u32) -> u8 {
        pixels[((y * size + x) * 4 + 3) as usize]
    }

    #[test]
    fn draws_the_play_glyph_solid_inside_and_clear_outside() {
        let pixels = rasterize(PLAY, 16, [255, 255, 255]);
        assert_eq!(pixels.len(), 16 * 16 * 4);
        assert_eq!(alpha(&pixels, 16, 8, 8), 255);
        assert_eq!(alpha(&pixels, 16, 0, 0), 0);
        assert_eq!(alpha(&pixels, 16, 15, 2), 0);
        assert_eq!(&pixels[(8 * 16 + 8) * 4..][..3], &[255, 255, 255]);
    }

    #[test]
    fn keeps_the_gap_between_pause_bars_and_anti_aliases_edges() {
        let pixels = rasterize(PAUSE, 24, [0, 0, 0]);
        assert_eq!(alpha(&pixels, 24, 8, 12), 255);
        assert_eq!(alpha(&pixels, 24, 12, 12), 0);
        let edge = alpha(&pixels, 24, 10, 12); // the bar ends at 10.2
        assert!(edge > 0 && edge < 255);
    }

    #[test]
    fn mirrors_previous_and_next() {
        let size = 20;
        let (previous, next) = (rasterize(PREVIOUS, size, [255, 255, 255]), rasterize(NEXT, size, [255, 255, 255]));
        let opaque = |p: &[u8]| p.chunks(4).filter(|px| px[3] > 127).count();
        assert!(opaque(&previous).abs_diff(opaque(&next)) <= size as usize);
    }
}
