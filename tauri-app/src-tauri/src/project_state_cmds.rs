use serde::{Deserialize, Serialize};

use crate::app_dir::{get_projects_dir, get_project_state_path};

// ============================================================
// Project State（项目内状态）
// ============================================================

/// 标签页信息（路径 + Markdown 模式）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub path: String,
    pub md_mode: Option<String>,
}

/// 面板宽度（侧栏 / AI 面板）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PanelWidths {
    #[serde(default)]
    pub sidebar_width: Option<u32>,
    #[serde(default)]
    pub agent_width: Option<u32>,
}

/// 项目状态（展开路径 + 当前文件 + 打开的标签页 + 面板宽度）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    pub expanded_paths: Vec<String>,
    pub current_file: Option<String>,
    pub open_tabs: Vec<TabInfo>,
    #[serde(default)]
    pub panel_widths: PanelWidths,
}

/// 保存项目状态到 projects/project-{uid}.json
#[tauri::command]
pub fn save_tree_state(
    project_path: String,
    expanded_paths: Vec<String>,
    current_file: Option<String>,
    open_tabs: Option<Vec<TabInfo>>,
    panel_widths: Option<PanelWidths>,
) -> Result<(), String> {
    let state_path = get_project_state_path(&project_path)?;
    let projects_dir = get_projects_dir()?;
    if !projects_dir.exists() {
        std::fs::create_dir_all(&projects_dir).map_err(|e| e.to_string())?;
    }

    let state = serde_json::json!({
        "expanded_paths": expanded_paths,
        "current_file": current_file,
        "open_tabs": open_tabs.unwrap_or_default(),
        "panel_widths": panel_widths.unwrap_or_default(),
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
            open_tabs: vec![],
            panel_widths: PanelWidths::default(),
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
    let open_tabs = state["open_tabs"]
        .as_array()
        .map(|arr| {
            arr.iter().filter_map(|v| {
                // 兼容旧格式：如果是字符串则视为纯路径
                if let Some(s) = v.as_str() {
                    return Some(TabInfo { path: s.to_string(), md_mode: None });
                }
                // 新格式：对象 { path, md_mode }
                let path = v.get("path")?.as_str()?.to_string();
                let md_mode = v.get("md_mode").and_then(|m| m.as_str()).map(String::from);
                Some(TabInfo { path, md_mode })
            }).collect()
        })
        .unwrap_or_default();

    let panel_widths: PanelWidths = state
        .get("panel_widths")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    Ok(ProjectState {
        expanded_paths,
        current_file,
        open_tabs,
        panel_widths,
    })
}
