// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `carbon now-playing` is answered here, without starting Carbon a second time.
    if let Some(code) = carbon_lib::cli::run_early() {
        std::process::exit(code);
    }
    carbon_lib::run()
}
