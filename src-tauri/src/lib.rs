mod provider;
mod selection;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            provider::desktop_status,
            provider::desktop_translate,
            selection::capture_selected_text
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Wordwise desktop app");
}
