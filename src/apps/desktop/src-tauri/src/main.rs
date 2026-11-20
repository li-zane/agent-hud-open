#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // A release build owns the client hooks, as the official app does: they
    // run this executable, and it claims their shared lock. A development
    // build leaves them to the installed app.
    let canonical_executable = if cfg!(debug_assertions) {
        None
    } else {
        std::env::current_exe().ok()
    };
    agent_hud_host::run_with_options(
        tauri::generate_context!(),
        None,
        agent_hud_host::HostOptions {
            canonical_executable,
        },
    );
}
