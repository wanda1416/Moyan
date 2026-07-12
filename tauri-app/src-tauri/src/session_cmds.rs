use std::path::PathBuf;
use serde::{Deserialize, Serialize};

use crate::app_dir::{get_projects_dir, project_path_to_uid};

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
