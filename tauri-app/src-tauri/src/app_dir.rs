use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 获取 ~/.moyan 目录路径
pub fn get_moyan_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())?;
    Ok(home.join(".moyan"))
}

/// 获取 ~/.moyan/projects 目录
pub fn get_projects_dir() -> Result<PathBuf, String> {
    Ok(get_moyan_dir()?.join("projects"))
}

/// 应用初始化：确保 ~/.moyan 目录结构存在
#[tauri::command]
pub fn init_app_dir() -> Result<AppDirInfo, String> {
    let moyan_dir = get_moyan_dir()?;
    let projects_dir = get_projects_dir()?;
    let config_path = moyan_dir.join("config.json");

    // 创建目录结构
    if !moyan_dir.exists() {
        std::fs::create_dir_all(&moyan_dir).map_err(|e| e.to_string())?;
    }
    if !projects_dir.exists() {
        std::fs::create_dir_all(&projects_dir).map_err(|e| e.to_string())?;
    }

    // 创建默认配置文件
    if !config_path.exists() {
        let default_config = serde_json::json!({
            "recent_projects": [],
            "python_host": "127.0.0.1",
            "python_port": 8765,
            "llm_provider": "openai",
            "llm_model": ""
        });
        let content = serde_json::to_string_pretty(&default_config).map_err(|e| e.to_string())?;
        std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
    }

    Ok(AppDirInfo {
        moyan_dir: moyan_dir.to_string_lossy().to_string(),
        projects_dir: projects_dir.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
    })
}

/// 读取应用配置
#[tauri::command]
pub fn read_app_config() -> Result<serde_json::Value, String> {
    let config_path = get_moyan_dir()?.join("config.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({}))
    }
}

/// 保存应用配置
#[tauri::command]
pub fn write_app_config(config: String) -> Result<(), String> {
    let config_path = get_moyan_dir()?.join("config.json");
    // 验证 JSON 格式
    let _: serde_json::Value = serde_json::from_str(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, config).map_err(|e| e.to_string())
}

/// 添加最近项目记录
#[tauri::command]
pub fn add_recent_project(project_path: String) -> Result<(), String> {
    let config_path = get_moyan_dir()?.join("config.json");

    let mut config: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let recent = config["recent_projects"]
        .as_array_mut()
        .map(|a| a.clone())
        .unwrap_or_default();

    // 去重并添加到开头
    let mut new_recent: Vec<serde_json::Value> = recent
        .into_iter()
        .filter(|p| p.as_str() != Some(&project_path))
        .collect();
    new_recent.insert(0, serde_json::Value::String(project_path));

    // 最多保留 10 个
    new_recent.truncate(10);
    config["recent_projects"] = serde_json::Value::Array(new_recent);

    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())
}

/// 获取 ~/.moyan/state.json 路径（项目状态存储）
fn get_state_path() -> Result<PathBuf, String> {
    Ok(get_moyan_dir()?.join("state.json"))
}

/// 项目状态（展开路径 + 当前文件）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    pub expanded_paths: Vec<String>,
    pub current_file: Option<String>,
}

/// 保存项目状态（目录树展开 + 当前打开文件）
#[tauri::command]
pub fn save_tree_state(
    project_path: String,
    expanded_paths: Vec<String>,
    current_file: Option<String>,
) -> Result<(), String> {
    let state_path = get_state_path()?;

    let mut state: serde_json::Value = if state_path.exists() {
        let content = std::fs::read_to_string(&state_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if state.get("project_states").is_none() {
        state["project_states"] = serde_json::json!({});
    }

    let project_state = serde_json::json!({
        "expanded_paths": expanded_paths,
        "current_file": current_file,
    });
    state["project_states"][&project_path] = project_state;

    let content = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(&state_path, content).map_err(|e| e.to_string())
}

/// 加载项目状态（展开路径 + 当前文件）
#[tauri::command]
pub fn load_tree_state(project_path: String) -> Result<ProjectState, String> {
    let state_path = get_state_path()?;

    if !state_path.exists() {
        return Ok(ProjectState {
            expanded_paths: vec![],
            current_file: None,
        });
    }

    let content = std::fs::read_to_string(&state_path).map_err(|e| e.to_string())?;
    let state: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let project_state = &state["project_states"][&project_path];

    if project_state.is_object() {
        let expanded_paths = project_state["expanded_paths"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        let current_file = project_state["current_file"]
            .as_str()
            .map(String::from);
        return Ok(ProjectState {
            expanded_paths,
            current_file,
        });
    }

    Ok(ProjectState {
        expanded_paths: vec![],
        current_file: None,
    })
}

/// 目录信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppDirInfo {
    pub moyan_dir: String,
    pub projects_dir: String,
    pub config_path: String,
}
