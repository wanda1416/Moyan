use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs::OpenOptions;
use std::io::Write;
use chrono::Local;

// ============================================================
// 路径管理
// ============================================================

/// 获取 ~/.moyan 目录路径
pub fn get_moyan_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())?;
    Ok(home.join(".moyan"))
}

/// 获取 ~/.moyan/projects 目录
pub fn get_projects_dir() -> Result<PathBuf, String> {
    Ok(get_moyan_dir()?.join("projects"))
}

/// 获取 ~/.moyan/settings.json 路径（用户设置）
fn get_settings_path() -> Result<PathBuf, String> {
    Ok(get_moyan_dir()?.join("settings.json"))
}

/// 获取 ~/.moyan/workspace.json 路径（工作区上下文）
fn get_workspace_path() -> Result<PathBuf, String> {
    Ok(get_moyan_dir()?.join("workspace.json"))
}

/// 获取 ~/.moyan/config.json 路径（旧配置，迁移用）
fn get_old_config_path() -> Result<PathBuf, String> {
    Ok(get_moyan_dir()?.join("config.json"))
}

/// 获取 ~/.moyan/state.json 路径（旧状态，迁移用）
fn get_old_state_path() -> Result<PathBuf, String> {
    Ok(get_moyan_dir()?.join("state.json"))
}

/// 项目路径转 UID（用于 project-{uid}.json 文件名）
fn project_path_to_uid(path: &str) -> String {
    // 使用简单的 hash 避免路径中的特殊字符
    let mut hash: u64 = 5381;
    for byte in path.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(byte as u64);
    }
    format!("{:016x}", hash)
}

/// 获取项目状态文件路径 ~/.moyan/projects/project-{uid}.json
fn get_project_state_path(project_path: &str) -> Result<PathBuf, String> {
    let uid = project_path_to_uid(project_path);
    Ok(get_projects_dir()?.join(format!("project-{}.json", uid)))
}

// ============================================================
// 应用初始化 + 迁移
// ============================================================

/// 应用初始化：确保 ~/.moyan 目录结构存在，执行旧配置迁移
#[tauri::command]
pub fn init_app_dir() -> Result<AppDirInfo, String> {
    let moyan_dir = get_moyan_dir()?;
    let projects_dir = get_projects_dir()?;
    let settings_path = get_settings_path()?;
    let workspace_path = get_workspace_path()?;

    // 创建目录结构
    if !moyan_dir.exists() {
        std::fs::create_dir_all(&moyan_dir).map_err(|e| e.to_string())?;
    }
    if !projects_dir.exists() {
        std::fs::create_dir_all(&projects_dir).map_err(|e| e.to_string())?;
    }

    // 迁移旧 config.json -> settings.json + workspace.json
    let old_config_path = get_old_config_path()?;
    if old_config_path.exists() && !settings_path.exists() {
        let _ = migrate_old_config(&old_config_path, &settings_path, &workspace_path);
    }

    // 迁移旧 state.json -> project-{uid}.json
    let old_state_path = get_old_state_path()?;
    if old_state_path.exists() {
        let _ = migrate_old_state(&old_state_path, &projects_dir);
    }

    // 创建默认 settings.json
    if !settings_path.exists() {
        let default_settings = serde_json::json!({
            "theme": "light",
            "active_provider_id": "provider_1",
            "llm_providers": [
                {
                    "id": "provider_1",
                    "name": "OpenAI",
                    "provider": "openai",
                    "api_key": "",
                    "base_url": "https://api.openai.com/v1",
                    "model": "gpt-4o",
                    "proxy": "",
                    "use_proxy": false
                }
            ]
        });
        let content = serde_json::to_string_pretty(&default_settings).map_err(|e| e.to_string())?;
        std::fs::write(&settings_path, content).map_err(|e| e.to_string())?;
    }

    // 创建默认 workspace.json
    if !workspace_path.exists() {
        let default_workspace = serde_json::json!({
            "recent_projects": [],
            "last_project": null
        });
        let content = serde_json::to_string_pretty(&default_workspace).map_err(|e| e.to_string())?;
        std::fs::write(&workspace_path, content).map_err(|e| e.to_string())?;
    }

    Ok(AppDirInfo {
        moyan_dir: moyan_dir.to_string_lossy().to_string(),
        projects_dir: projects_dir.to_string_lossy().to_string(),
        config_path: settings_path.to_string_lossy().to_string(),
    })
}

/// 迁移旧 config.json 到 settings.json + workspace.json
fn migrate_old_config(old_path: &PathBuf, settings_path: &PathBuf, workspace_path: &PathBuf) -> Result<(), String> {
    let content = std::fs::read_to_string(old_path).map_err(|e| e.to_string())?;
    let old: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // 提取 workspace 数据
    let workspace = serde_json::json!({
        "recent_projects": old.get("recent_projects").cloned().unwrap_or_else(|| serde_json::json!([])),
        "last_project": null
    });
    let ws_content = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
    std::fs::write(workspace_path, ws_content).map_err(|e| e.to_string())?;

    // 提取 settings 数据（LLM 配置 + 主题）
    let mut settings = serde_json::json!({
        "theme": "light",
        "active_provider_id": old.get("active_provider_id").cloned().unwrap_or_else(|| serde_json::json!("provider_1")),
        "llm_providers": old.get("llm_providers").cloned().unwrap_or_else(|| serde_json::json!([]))
    });

    // 迁移旧格式 LLM 配置
    if settings["llm_providers"].as_array().map_or(true, |a| a.is_empty()) {
        if let Some(provider) = old.get("llm_provider") {
            let entry = serde_json::json!([{
                "id": "provider_1",
                "name": match provider.as_str().unwrap_or("openai") {
                    "claude" => "Claude",
                    "ollama" => "Ollama",
                    _ => "OpenAI",
                },
                "provider": provider.as_str().unwrap_or("openai"),
                "api_key": old.get("llm_api_key").unwrap_or(&serde_json::json!("")),
                "base_url": old.get("llm_base_url").unwrap_or(&serde_json::json!("")),
                "model": old.get("llm_model").unwrap_or(&serde_json::json!("gpt-4o")),
                "proxy": "",
                "use_proxy": false
            }]);
            settings["llm_providers"] = entry;
        }
    }

    if let Some(theme) = old.get("theme") {
        settings["theme"] = theme.clone();
    }

    let st_content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(settings_path, st_content).map_err(|e| e.to_string())?;

    Ok(())
}

/// 迁移旧 state.json 到 project-{uid}.json
fn migrate_old_state(old_path: &PathBuf, projects_dir: &PathBuf) -> Result<(), String> {
    let content = std::fs::read_to_string(old_path).map_err(|e| e.to_string())?;
    let old: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // 迁移 last_project
    if let Some(last) = old.get("last_project").and_then(|v| v.as_str()) {
        let workspace_path = get_workspace_path()?;
        let mut workspace: serde_json::Value = if workspace_path.exists() {
            let ws_content = std::fs::read_to_string(&workspace_path).map_err(|e| e.to_string())?;
            serde_json::from_str(&ws_content).unwrap_or_else(|_| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };
        workspace["last_project"] = serde_json::Value::String(last.to_string());
        let ws_content = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
        std::fs::write(&workspace_path, ws_content).map_err(|e| e.to_string())?;
    }

    // 迁移 project_states
    if let Some(states) = old.get("project_states").and_then(|v| v.as_object()) {
        for (path, state) in states {
            let uid = project_path_to_uid(path);
            let file_path = projects_dir.join(format!("project-{}.json", uid));
            let state_content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
            let _ = std::fs::write(&file_path, state_content);
        }
    }

    Ok(())
}

// ============================================================
// Settings（用户设置）
// ============================================================

/// 读取用户设置
#[tauri::command]
pub fn get_settings() -> Result<serde_json::Value, String> {
    let settings_path = get_settings_path()?;
    if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({}))
    }
}

/// 保存用户设置
#[tauri::command]
pub fn save_settings(settings: String) -> Result<(), String> {
    let settings_path = get_settings_path()?;
    let _: serde_json::Value = serde_json::from_str(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, settings).map_err(|e| e.to_string())
}

// ============================================================
// Workspace（工作区上下文）
// ============================================================

/// 获取最近项目列表
#[tauri::command]
pub fn get_recent_projects() -> Result<Vec<String>, String> {
    let workspace_path = get_workspace_path()?;
    if !workspace_path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&workspace_path).map_err(|e| e.to_string())?;
    let workspace: serde_json::Value = serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}));
    let recent = workspace["recent_projects"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    Ok(recent)
}

/// 添加最近项目记录
#[tauri::command]
pub fn add_recent_project(project_path: String) -> Result<(), String> {
    let workspace_path = get_workspace_path()?;

    let mut workspace: serde_json::Value = if workspace_path.exists() {
        let content = std::fs::read_to_string(&workspace_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let recent = workspace["recent_projects"]
        .as_array()
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
    workspace["recent_projects"] = serde_json::Value::Array(new_recent);

    let content = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
    std::fs::write(&workspace_path, content).map_err(|e| e.to_string())
}

/// 从最近项目列表移除
#[tauri::command]
pub fn remove_recent_project(project_path: String) -> Result<(), String> {
    let workspace_path = get_workspace_path()?;

    let mut workspace: serde_json::Value = if workspace_path.exists() {
        let content = std::fs::read_to_string(&workspace_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let recent = workspace["recent_projects"]
        .as_array()
        .map(|a| a.clone())
        .unwrap_or_default();

    let new_recent: Vec<serde_json::Value> = recent
        .into_iter()
        .filter(|p| p.as_str() != Some(&project_path))
        .collect();

    workspace["recent_projects"] = serde_json::Value::Array(new_recent);

    // 如果移除的是 last_project，也清除
    if workspace["last_project"].as_str() == Some(&project_path) {
        workspace["last_project"] = serde_json::Value::Null;
    }

    let content = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
    std::fs::write(&workspace_path, content).map_err(|e| e.to_string())
}

/// 获取上次打开的项目路径
#[tauri::command]
pub fn get_last_project() -> Result<Option<String>, String> {
    let workspace_path = get_workspace_path()?;
    if !workspace_path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&workspace_path).map_err(|e| e.to_string())?;
    let workspace: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(workspace["last_project"].as_str().map(String::from))
}

/// 保存上次打开的项目路径
#[tauri::command]
pub fn set_last_project(project_path: String) -> Result<(), String> {
    let workspace_path = get_workspace_path()?;

    let mut workspace: serde_json::Value = if workspace_path.exists() {
        let content = std::fs::read_to_string(&workspace_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    workspace["last_project"] = serde_json::Value::String(project_path);

    let content = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
    std::fs::write(&workspace_path, content).map_err(|e| e.to_string())
}

/// 清除上次打开的项目路径
#[tauri::command]
pub fn clear_last_project() -> Result<(), String> {
    let workspace_path = get_workspace_path()?;

    let mut workspace: serde_json::Value = if workspace_path.exists() {
        let content = std::fs::read_to_string(&workspace_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    workspace["last_project"] = serde_json::Value::Null;

    let content = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
    std::fs::write(&workspace_path, content).map_err(|e| e.to_string())
}

// ============================================================
// Project State（项目内状态）
// ============================================================

/// 项目状态（展开路径 + 当前文件）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    pub expanded_paths: Vec<String>,
    pub current_file: Option<String>,
}

/// 保存项目状态到 projects/project-{uid}.json
#[tauri::command]
pub fn save_tree_state(
    project_path: String,
    expanded_paths: Vec<String>,
    current_file: Option<String>,
) -> Result<(), String> {
    let state_path = get_project_state_path(&project_path)?;
    let projects_dir = get_projects_dir()?;
    if !projects_dir.exists() {
        std::fs::create_dir_all(&projects_dir).map_err(|e| e.to_string())?;
    }

    let state = serde_json::json!({
        "expanded_paths": expanded_paths,
        "current_file": current_file,
    });
    let content = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(&state_path, content).map_err(|e| e.to_string())
}

/// 加载项目状态从 projects/project-{uid}.json
#[tauri::command]
pub fn load_tree_state(project_path: String) -> Result<ProjectState, String> {
    let state_path = get_project_state_path(&project_path)?;

    if !state_path.exists() {
        return Ok(ProjectState {
            expanded_paths: vec![],
            current_file: None,
        });
    }

    let content = std::fs::read_to_string(&state_path).map_err(|e| e.to_string())?;
    let state: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let expanded_paths = state["expanded_paths"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let current_file = state["current_file"]
        .as_str()
        .map(String::from);

    Ok(ProjectState {
        expanded_paths,
        current_file,
    })
}

// ============================================================
// Sessions（会话历史）
// ============================================================

/// 会话摘要（用于列表显示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: usize,
}

/// 会话完整数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub messages: Vec<serde_json::Value>,
}

/// 获取会话目录路径 ~/.moyan/projects/sessions-{uid}/
fn get_sessions_dir(project_path: &str) -> Result<PathBuf, String> {
    let uid = project_path_to_uid(project_path);
    Ok(get_projects_dir()?.join(format!("sessions-{}", uid)))
}

/// 获取会话索引文件路径
fn get_sessions_index_path(project_path: &str) -> Result<PathBuf, String> {
    Ok(get_sessions_dir(project_path)?.join("sessions.json"))
}

/// 获取单个会话文件路径
fn get_session_file_path(project_path: &str, session_id: &str) -> Result<PathBuf, String> {
    Ok(get_sessions_dir(project_path)?.join(format!("session-{}.json", session_id)))
}

/// 读取会话索引
fn read_sessions_index(project_path: &str) -> Result<Vec<SessionSummary>, String> {
    let index_path = get_sessions_index_path(project_path)?;
    if !index_path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}));
    let sessions: Vec<SessionSummary> = json["sessions"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
        .unwrap_or_default();
    Ok(sessions)
}

/// 写入会话索引
fn write_sessions_index(project_path: &str, sessions: &[SessionSummary]) -> Result<(), String> {
    let sessions_dir = get_sessions_dir(project_path)?;
    if !sessions_dir.exists() {
        std::fs::create_dir_all(&sessions_dir).map_err(|e| e.to_string())?;
    }
    let index_path = get_sessions_index_path(project_path)?;
    let json = serde_json::json!({ "sessions": sessions });
    let content = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(&index_path, content).map_err(|e| e.to_string())
}

/// 列出项目的所有会话
#[tauri::command]
pub fn list_sessions(project_path: String) -> Result<Vec<SessionSummary>, String> {
    let mut sessions = read_sessions_index(&project_path)?;
    // 按更新时间倒序排列
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

/// 加载单个会话的完整数据
#[tauri::command]
pub fn load_session(project_path: String, session_id: String) -> Result<SessionData, String> {
    let file_path = get_session_file_path(&project_path, &session_id)?;
    if !file_path.exists() {
        return Err("会话不存在".to_string());
    }
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

/// 保存/更新会话
#[tauri::command]
pub fn save_session(
    project_path: String,
    session_id: String,
    title: String,
    messages: Vec<serde_json::Value>,
) -> Result<(), String> {
    let sessions_dir = get_sessions_dir(&project_path)?;
    if !sessions_dir.exists() {
        std::fs::create_dir_all(&sessions_dir).map_err(|e| e.to_string())?;
    }

    let now = chrono::Utc::now().to_rfc3339();
    let message_count = messages.len();

    // 读取现有索引，查找是否已存在
    let mut sessions = read_sessions_index(&project_path)?;
    let existing_idx = sessions.iter().position(|s| s.id == session_id);

    let (created_at, updated_at) = if let Some(idx) = existing_idx {
        // 更新现有记录
        let old = &sessions[idx];
        let created = old.created_at.clone();
        sessions[idx] = SessionSummary {
            id: session_id.clone(),
            title: title.clone(),
            created_at: created.clone(),
            updated_at: now.clone(),
            message_count,
        };
        (created, now)
    } else {
        // 新增记录
        sessions.push(SessionSummary {
            id: session_id.clone(),
            title: title.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
            message_count,
        });
        (now.clone(), now)
    };

    // 写入会话文件
    let session_data = SessionData {
        id: session_id,
        title,
        created_at,
        updated_at,
        messages,
    };
    let file_path = get_session_file_path(&project_path, &session_data.id)?;
    let content = serde_json::to_string_pretty(&session_data).map_err(|e| e.to_string())?;
    std::fs::write(&file_path, content).map_err(|e| e.to_string())?;

    // 写入索引
    write_sessions_index(&project_path, &sessions)?;

    Ok(())
}

/// 删除会话
#[tauri::command]
pub fn delete_session(project_path: String, session_id: String) -> Result<(), String> {
    // 删除会话文件
    let file_path = get_session_file_path(&project_path, &session_id)?;
    if file_path.exists() {
        std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }

    // 更新索引
    let mut sessions = read_sessions_index(&project_path)?;
    sessions.retain(|s| s.id != session_id);
    write_sessions_index(&project_path, &sessions)?;

    Ok(())
}

/// 获取当前激活的会话 ID
#[tauri::command]
pub fn get_current_session(project_path: String) -> Result<Option<String>, String> {
    let index_path = get_sessions_index_path(&project_path)?;
    if !index_path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}));
    Ok(json["current_session_id"].as_str().map(String::from))
}

/// 设置当前激活的会话 ID
#[tauri::command]
pub fn set_current_session(project_path: String, session_id: Option<String>) -> Result<(), String> {
    let sessions_dir = get_sessions_dir(&project_path)?;
    if !sessions_dir.exists() {
        std::fs::create_dir_all(&sessions_dir).map_err(|e| e.to_string())?;
    }
    let index_path = get_sessions_index_path(&project_path)?;

    let mut json: serde_json::Value = if index_path.exists() {
        let content = std::fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    match session_id {
        Some(id) => json["current_session_id"] = serde_json::Value::String(id),
        None => json["current_session_id"] = serde_json::Value::Null,
    }

    let content = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(&index_path, content).map_err(|e| e.to_string())
}

// ============================================================
// LLM 配置（读写 settings.json 中的 LLM 部分）
// ============================================================

/// 目录信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppDirInfo {
    pub moyan_dir: String,
    pub projects_dir: String,
    pub config_path: String,
}

/// 单个 LLM 供应商配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMProviderEntry {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub proxy: String,
    #[serde(default)]
    pub use_proxy: bool,
}

/// LLM 配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMConfig {
    pub active_provider_id: String,
    pub providers: Vec<LLMProviderEntry>,
}

/// 获取 LLM 配置（从 settings.json 读取）
#[tauri::command]
pub fn get_config() -> Result<LLMConfig, String> {
    let settings_path = get_settings_path()?;

    let default_config = LLMConfig {
        active_provider_id: "provider_1".to_string(),
        providers: vec![LLMProviderEntry {
            id: "provider_1".to_string(),
            name: "OpenAI".to_string(),
            provider: "openai".to_string(),
            api_key: String::new(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o".to_string(),
            proxy: String::new(),
            use_proxy: false,
        }],
    };

    if !settings_path.exists() {
        return Ok(default_config);
    }

    let content = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}));

    if let (Some(providers_val), Some(active_id)) = (json.get("llm_providers"), json.get("active_provider_id")) {
        let providers: Vec<LLMProviderEntry> = providers_val
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
            .unwrap_or_default();

        if !providers.is_empty() {
            return Ok(LLMConfig {
                active_provider_id: active_id.as_str().unwrap_or("provider_1").to_string(),
                providers,
            });
        }
    }

    Ok(default_config)
}

/// 保存 LLM 配置（写入 settings.json + 同步到 Python 后端）
#[tauri::command]
pub async fn save_config(config: LLMConfig) -> Result<String, String> {
    let settings_path = get_settings_path()?;

    let mut json: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    json["active_provider_id"] = serde_json::Value::String(config.active_provider_id.clone());
    json["llm_providers"] = serde_json::to_value(&config.providers).map_err(|e| e.to_string())?;

    let content = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, content).map_err(|e| e.to_string())?;

    // 同步到 Python 后端
    let sync_payload = serde_json::json!({
        "active_provider_id": config.active_provider_id,
        "llm_providers": config.providers.iter().map(|p| {
            let mut entry = serde_json::json!({
                "id": p.id,
                "name": p.name,
                "provider": p.provider,
                "base_url": p.base_url,
                "model": p.model,
            });
            if p.api_key != "***" && !p.api_key.is_empty() {
                entry["api_key"] = serde_json::Value::String(p.api_key.clone());
            }
            entry
        }).collect::<Vec<_>>(),
    });

    let client = reqwest::Client::new();
    let sync_result = client
        .post("http://127.0.0.1:8765/api/config")
        .json(&sync_payload)
        .send()
        .await;

    match sync_result {
        Ok(resp) if resp.status().is_success() => Ok("ok".to_string()),
        Ok(resp) => Ok(format!("saved_no_sync|HTTP {}", resp.status())),
        Err(_) => Ok("saved_no_sync|Python 后端未运行，配置已保存到文件，重启后端后生效".to_string()),
    }
}

// ============================================================
// LLM 连接测试 & 模型列表
// ============================================================

/// 测试 LLM 连接
#[tauri::command]
pub async fn test_llm_connection(entry: LLMProviderEntry) -> Result<String, String> {
    let mut payload = serde_json::json!({
        "provider": entry.provider,
        "model": entry.model,
        "base_url": entry.base_url,
        "proxy": entry.proxy,
        "use_proxy": entry.use_proxy,
    });
    if entry.api_key != "***" && !entry.api_key.is_empty() {
        payload["api_key"] = serde_json::Value::String(entry.api_key);
    } else {
        payload["api_key"] = serde_json::Value::String(String::new());
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("http://127.0.0.1:8765/api/test_llm")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("无法连接 Python 后端: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Python 后端返回 HTTP {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    let status = body["status"].as_str().unwrap_or("error");
    let message = body["message"].as_str().unwrap_or("未知错误");

    if status == "ok" {
        Ok(message.to_string())
    } else {
        Err(message.to_string())
    }
}

/// 获取可用模型列表
#[tauri::command]
pub async fn list_models(entry: LLMProviderEntry) -> Result<Vec<String>, String> {
    let mut payload = serde_json::json!({
        "provider": entry.provider,
        "model": entry.model,
        "base_url": entry.base_url,
    });
    if entry.api_key != "***" && !entry.api_key.is_empty() {
        payload["api_key"] = serde_json::Value::String(entry.api_key);
    } else {
        payload["api_key"] = serde_json::Value::String(String::new());
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("http://127.0.0.1:8765/api/list_models")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("无法连接 Python 后端: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Python 后端返回 HTTP {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    let status = body["status"].as_str().unwrap_or("error");
    if status != "ok" {
        let msg = body["message"].as_str().unwrap_or("未知错误");
        return Err(msg.to_string());
    }

    let models = body["models"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    Ok(models)
}

// ============================================================
// 日志
// ============================================================

/// 写入前端日志到文件
#[tauri::command]
pub fn write_log(level: String, message: String) -> Result<(), String> {
    let moyan_dir = get_moyan_dir()?;
    let log_dir = moyan_dir.join("logs");

    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    }

    let log_file = log_dir.join("frontend.log");
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let log_line = format!("{} [{}] {}\n", timestamp, level, message);

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| e.to_string())?;

    file.write_all(log_line.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}
