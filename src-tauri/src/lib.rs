pub mod commands;
pub mod db;
pub mod zenoh;

use commands::*;
use db::Database;
use tauri::Emitter;
use zenoh::SessionManager;

pub struct AppState {
    pub session_manager: SessionManager,
    pub db: Database,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session_manager = SessionManager::new();
    let sm_clone = session_manager.clone();
    let db = Database::new("zenohx.db")
        .or_else(|_| Database::new_in_memory())
        .expect("failed to initialize SQLite database");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let sm = sm_clone.clone();
            tauri::async_runtime::spawn(async move {
                sm.set_status_callback(move |event| {
                    let _ = app_handle.emit("zenohx://session-status", event);
                })
                .await;
            });
            Ok(())
        })
        .manage(AppState {
            session_manager,
            db,
        })
        .invoke_handler(tauri::generate_handler![
            connect_session,
            disconnect_session,
            scout_locators,
            get_session_info,
            get_all_sessions,
            publish_sample,
            subscribe,
            unsubscribe,
            query_get,
            declare_queryable,
            undeclare_queryable,
            reply_query,
            save_queryable_preset,
            load_queryable_presets,
            delete_queryable_preset,
            save_query_execution,
            load_query_history,
            clear_query_history,
            delete_query_execution,
            save_profile,
            load_profiles,
            delete_profile,
            save_subscription_preset,
            load_subscription_presets,
            delete_subscription_preset,
            query_messages,
            save_message,
            clear_message_history,
            delete_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
