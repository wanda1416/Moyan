mod app_dir;
mod filesystem;
mod python_bridge;
mod config;

use std::sync::Mutex;
use tauri::Manager;
use app_dir::{init_app_dir, read_app_config, write_app_config, add_recent_project, save_tree_state, load_tree_state, get_config, save_config, test_llm_connection, list_models};
use filesystem::{get_project_tree, read_file, write_file, open_directory, read_file_base64};
use python_bridge::{PythonBridge, PythonConfig, start_python, stop_python, python_health_check, python_status};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 启动时初始化 ~/.moyan 目录
    let _ = app_dir::init_app_dir();

    // 创建 PythonBridge 实例
    let bridge = PythonBridge::new(PythonConfig::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(bridge))
        .invoke_handler(tauri::generate_handler![
            // 应用目录管理
            init_app_dir,
            read_app_config,
            write_app_config,
            add_recent_project,
            // 目录树状态持久化
            save_tree_state,
            load_tree_state,
            // 文件系统操作
            get_project_tree,
            read_file,
            write_file,
            read_file_base64,
            open_directory,
            // Python 进程管理
            start_python,
            stop_python,
            python_health_check,
            python_status,
            // LLM 配置
            get_config,
            save_config,
            test_llm_connection,
            list_models,
        ])
        .setup(|app| {
            // 应用启动后自动启动 Python 后端
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // 稍等一下让 UI 先渲染
                std::thread::sleep(std::time::Duration::from_millis(500));
                let bridge_state = handle.state::<Mutex<PythonBridge>>();
                if let Ok(bridge) = bridge_state.lock() {
                    match bridge.start_and_wait() {
                        Ok(msg) => eprintln!("[PythonBridge] {}", msg),
                        Err(e) => eprintln!("[PythonBridge] 启动失败: {}", e),
                    }
                };
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                eprintln!("[PythonBridge] 应用关闭，清理 Python 进程...");
                python_bridge::shutdown_python();
                let _ = window;
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
