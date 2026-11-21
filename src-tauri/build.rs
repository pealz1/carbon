// Discord's public application ID can also come from a developer's .env.local.
use std::fs;


fn main() {
    println!("cargo:rerun-if-changed=../.env.local");
    if let Ok(env) = fs::read_to_string("../.env.local") {
        for line in env.lines() {
            let Some((key, value)) = line.split_once('=') else { continue };
            let (key, value) = (key.trim(), value.trim().trim_matches('"'));
            if key == "CARBON_DISCORD_APP_ID" && !value.is_empty() {
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
