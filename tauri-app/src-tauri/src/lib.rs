mod app_dir;
mod filesystem;
mod python_bridge;
mod updater;

use std::sync::Mutex;
use tauri::Manager;
use app_dir::{
    init_app_dir, get_settings, save_settings,
    get_recent_projects, add_recent_project, remove_recent_project,
    get_last_project, set_last_project, clear_last_project,
    save_tree_state, load_tree_state,
    list_sessions, load_session, save_session, delete_session,
    get_current_session, set_current_session,
    get_config, save_config, test_llm_connection, list_models,
    write_log,
};
use filesystem::{get_project_tree, read_file, write_file, open_directory, read_file_base64};
use python_bridge::{PythonBridge, PythonConfig, LaunchMode, start_python, stop_python, python_health_check, python_status};
use updater::{check_update, app_version};

/// 根据编译模式选择 Python 启动方式
/// - dev 模式：使用 venv 中的 python main.py
/// - release 模式：使用打包好的 sidecar 二进制
fn select_launch_mode() -> LaunchMode {
    if cfg!(debug_assertions) {
        LaunchMode::Dev
    } else {
        LaunchMode::Sidecar
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 启动时初始化 ~/.moyan 目录
    let _ = app_dir::init_app_dir();

    // 创建 PythonBridge 实例（根据编译模式选择 dev / sidecar）
    let bridge = PythonBridge::with_mode(PythonConfig::default(), select_launch_mode());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(bridge))
        .invoke_handler(tauri::generate_handler![
            // 应用初始化
            init_app_dir,
            // 用户设置
            get_settings,
            save_settings,
            // 工作区
            get_recent_projects,
            add_recent_project,
            remove_recent_project,
            get_last_project,
            set_last_project,
            clear_last_project,
            // 项目状态
            save_tree_state,
            load_tree_state,
            // 会话历史
            list_sessions,
            load_session,
            save_session,
            delete_session,
            get_current_session,
            set_current_session,
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
            // 更新检测
            check_update,
            app_version,
            // 日志
            write_log,
        ])
        .setup(|app| {
            // 应用启动后自动启动 Python 后端
            let handle = app.handle().clone();
            std::thread::spawn(move || {
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
