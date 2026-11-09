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
    tauri_build::build()
}
