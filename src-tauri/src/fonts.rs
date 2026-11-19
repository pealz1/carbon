//! Installed font families for Settings → Appearance, and the rule a family name must pass before
//! the interface writes it into CSS.

const MAX_NAME_LEN: usize = 64;
/// Punctuation real family names use ("Segoe UI Emoji", "Bodoni MT Poster Compressed", "Franklin
/// Gothic Medium Cond", "Yu Gothic UI Semibold"). No quotes, backslashes, semicolons, braces or
/// slashes, so a name can't close the CSS string it goes into or start a comment.
const NAME_PUNCTUATION: &str = " -_.&+()";

pub fn is_safe_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_NAME_LEN
        && name.trim() == name
        && name.chars().all(|c| c.is_alphanumeric() || NAME_PUNCTUATION.contains(c))
}

/// Sorted A–Z ignoring case, without duplicates or names the interface couldn't use.
fn tidy(mut names: Vec<String>) -> Vec<String> {
    names.retain(|n| is_safe_name(n));
    names.sort_by_key(|n| n.to_lowercase());
    names.dedup();
    names
}

/// Family names as CSS (and WebView2) match them: DirectWrite's system collection, English names.
#[cfg(windows)]
pub fn installed() -> Result<Vec<String>, String> {
    use windows::Win32::Graphics::DirectWrite::{DWRITE_FACTORY_TYPE_SHARED, DWriteCreateFactory, IDWriteFactory, IDWriteFontCollection};

    let failed = |e: windows::core::Error| format!("couldn't list installed fonts: {e}");
    // SAFETY: DirectWrite calls on interfaces created and owned here; no raw pointers escape.
    unsafe {
        let factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED).map_err(failed)?;
        let mut collection: Option<IDWriteFontCollection> = None;
        factory.GetSystemFontCollection(&mut collection, false).map_err(failed)?;
        let collection = collection.ok_or("couldn't list installed fonts")?;
        let names = (0..collection.GetFontFamilyCount())
            .filter_map(|i| collection.GetFontFamily(i).ok()?.GetFamilyNames().ok())
            .filter_map(|names| english_name(&names))
            .collect();
        Ok(tidy(names))
    }
}

#[cfg(target_os = "macos")]
pub fn installed() -> Result<Vec<String>, String> {
    let families = core_text::font_manager::copy_available_font_family_names();
    Ok(tidy(families.iter().map(|name| name.to_string()).collect()))
}

#[cfg(target_os = "linux")]
pub fn installed() -> Result<Vec<String>, String> {
    let output = std::process::Command::new("fc-list").arg("--format=%{family}\n").output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Err("Could not read the system font list.".into()); }
    Ok(tidy(String::from_utf8_lossy(&output.stdout).lines().flat_map(|line| line.split(',')).map(|s| s.trim().to_owned()).collect()))
}

/// The en-us name when the family has one, else its first name.
#[cfg(windows)]
fn english_name(names: &windows::Win32::Graphics::DirectWrite::IDWriteLocalizedStrings) -> Option<String> {
    let mut index = 0;
    let mut exists = windows::core::BOOL(0);
    // SAFETY: the out-pointers are locals; the buffer is sized from GetStringLength plus the terminator.
    unsafe {
        names.FindLocaleName(windows::core::w!("en-us"), &mut index, &mut exists).ok()?;
        if !exists.as_bool() {
            index = 0;
        }
        let len = names.GetStringLength(index).ok()? as usize;
        let mut buffer = vec![0u16; len + 1];
        names.GetString(index, &mut buffer).ok()?;
        String::from_utf16(&buffer[..len]).ok()
    }
}

#[tauri::command]
pub async fn fonts_installed() -> Result<Vec<String>, String> {
    installed()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_real_family_names() {
        for name in ["Segoe UI", "Segoe UI Variable Display", "Bahnschrift SemiBold", "Bodoni MT Poster Compressed", "Yu Gothic UI", "MS Gothic", "游ゴシック"] {
            assert!(is_safe_name(name), "{name}");
        }
    }

    #[test]
    fn rejects_names_that_could_escape_css() {
        let long = "A".repeat(MAX_NAME_LEN + 1);
        for name in [
            "",
            " Segoe UI",
            "Segoe UI ",
            "Arial\"; } body { display: none",
            "Arial'",
            "Arial\\",
            "Arial;",
            "Arial{",
            "Arial}",
            "Arial<",
            "Arial/*",
            "Arial\nX",
            "Arial\u{0}",
            long.as_str(),
        ] {
            assert!(!is_safe_name(name), "{name:?}");
        }
    }

    #[test]
    fn tidies_the_list() {
        let names = ["segoe UI", "Arial", "Arial", "Bad\"Font", "Calibri"].map(String::from).to_vec();
        assert_eq!(tidy(names), ["Arial", "Calibri", "segoe UI"]);
    }

    #[cfg(windows)]
    #[test]
    fn lists_windows_fonts() {
        let fonts = installed().expect("DirectWrite lists fonts");
        assert!(fonts.iter().any(|f| f == "Segoe UI"), "Segoe UI ships with Windows");
        assert!(fonts.iter().all(|f| is_safe_name(f)));
    }
}
