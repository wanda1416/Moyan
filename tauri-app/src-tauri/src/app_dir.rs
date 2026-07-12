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
pub fn get_settings_path() -> Result<PathBuf, String> {
    Ok(get_moyan_dir()?.join("settings.json"))
}

/// 获取 ~/.moyan/workspace.json 路径（工作区上下文）
pub fn get_workspace_path() -> Result<PathBuf, String> {
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
pub fn project_path_to_uid(path: &str) -> String {
    // 使用简单的 hash 避免路径中的特殊字符
    let mut hash: u64 = 5381;
    for byte in path.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(byte as u64);
    }
    format!("{:016x}", hash)
}

/// 获取项目状态文件路径 ~/.moyan/projects/project-{uid}.json
pub fn get_project_state_path(project_path: &str) -> Result<PathBuf, String> {
    let uid = project_path_to_uid(project_path);
    Ok(get_projects_dir()?.join(format!("project-{}.json", uid)))
}

// ============================================================
// 应用初始化 + 迁移
// ============================================================

/// 目录信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppDirInfo {
    pub moyan_dir: String,
    pub projects_dir: String,
    pub config_path: String,
}

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

// ============================================================
// RAG 检索（代理到 Python 后端）
// ============================================================

/// 构建项目 RAG 索引
#[tauri::command]
pub async fn build_rag_index(project_path: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({ "project_root": project_path });

    let resp = client
        .post("http://127.0.0.1:8765/api/rag/build_index")
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

    Ok(body)
}

/// 增量刷新项目 RAG 索引
#[tauri::command]
pub async fn refresh_rag_index(project_path: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({ "project_root": project_path });

    let resp = client
        .post("http://127.0.0.1:8765/api/rag/refresh_index")
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

    Ok(body)
}

/// 语义检索
#[tauri::command]
pub async fn search_rag(
    project_path: String,
    query: String,
    top_k: Option<i32>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "project_root": project_path,
        "query": query,
        "top_k": top_k.unwrap_or(5),
    });

    let resp = client
        .post("http://127.0.0.1:8765/api/rag/search")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("无法连接 Python 后端: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Python 后端返回 HTTP {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    Ok(body)
}

/// 获取索引状态
#[tauri::command]
pub async fn get_rag_index_status(project_path: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "http://127.0.0.1:8765/api/rag/index_status?project_root={}",
        urlencoding::encode(&project_path)
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("无法连接 Python 后端: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Python 后端返回 HTTP {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    Ok(body)
}

/// 删除项目 RAG 索引（直接删除本地索引目录）
#[tauri::command]
pub fn delete_rag_index(project_path: String) -> Result<serde_json::Value, String> {
    let uid = project_path_to_uid(&project_path);
    let index_dir = get_projects_dir()?.join(format!("index-{}", uid));

    if !index_dir.exists() {
        return Ok(serde_json::json!({ "status": "ok", "message": "索引不存在，无需删除" }));
    }

    std::fs::remove_dir_all(&index_dir).map_err(|e| format!("删除索引目录失败: {}", e))?;
    Ok(serde_json::json!({ "status": "ok", "message": "索引已删除" }))
}
