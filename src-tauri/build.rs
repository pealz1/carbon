// Bakes integration keys from ../.env.local (gitignored) into the binary at compile time,
// so no key ever lives in source control. Missing keys simply disable that integration.
use std::fs;

const KEYS: [&str; 3] = ["CARBON_LASTFM_API_KEY", "CARBON_LASTFM_SECRET", "CARBON_DISCORD_APP_ID"];

fn main() {
    println!("cargo:rerun-if-changed=../.env.local");
    if let Ok(env) = fs::read_to_string("../.env.local") {
        for line in env.lines() {
            let Some((key, value)) = line.split_once('=') else { continue };
            let (key, value) = (key.trim(), value.trim().trim_matches('"'));
            if KEYS.contains(&key) && !value.is_empty() {
                println!("cargo:rustc-env={key}={value}");
            }
        }
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref()==Ok("macos") {
        println!("cargo:rerun-if-changed=native/touchbar.m");
        cc::Build::new().file("native/touchbar.m").flag("-fobjc-arc").flag("-fblocks").compile("carbon_touchbar");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }
    tauri_build::build()
}
