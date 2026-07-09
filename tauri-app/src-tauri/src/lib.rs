mod app_dir;
mod filesystem;
mod python_bridge;
mod config;

use app_dir::{init_app_dir, read_app_config, write_app_config, add_recent_project};
use filesystem::{get_project_tree, read_file, write_file, open_directory, read_file_base64};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 启动时初始化 ~/.moyan 目录
    let _ = app_dir::init_app_dir();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // 应用目录管理
            init_app_dir,
            read_app_config,
            write_app_config,
            add_recent_project,
            // 文件系统操作
            get_project_tree,
            read_file,
            write_file,
            read_file_base64,
            open_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
