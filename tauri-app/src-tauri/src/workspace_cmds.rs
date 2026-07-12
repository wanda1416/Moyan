use crate::app_dir::get_workspace_path;

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
