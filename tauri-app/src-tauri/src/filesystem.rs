use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 文件系统节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

/// 获取项目目录树（指定路径）
#[tauri::command]
pub fn get_project_tree(path: Option<String>) -> Result<FileNode, String> {
    let root = if let Some(p) = path {
        PathBuf::from(p)
    } else {
        // 默认使用 ~/.moyan
        dirs::home_dir()
            .ok_or_else(|| "无法获取用户主目录".to_string())?
            .join(".moyan")
    };

    if !root.exists() {
        return Err(format!("目录不存在: {}", root.display()));
    }

    build_tree(&root)
}

/// 打开目录选择对话框，返回选中的路径
#[tauri::command]
pub async fn open_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|f| f.to_string()))
}

/// 读取文件内容
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 写入文件内容
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}

/// 读取二进制文件为 base64（用于图片预览）
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// 递归构建目录树
fn build_tree(dir: &PathBuf) -> Result<FileNode, String> {
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut children = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut sorted_entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        sorted_entries.sort_by_key(|e| e.file_name());

        for entry in sorted_entries {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // 跳过隐藏文件和 node_modules
            if file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" {
                continue;
            }

            if path.is_dir() {
                children.push(build_tree(&path)?);
            } else {
                children.push(FileNode {
                    name: file_name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                    children: None,
                });
            }
        }
    }

    Ok(FileNode {
        name,
        path: dir.to_string_lossy().to_string(),
        is_dir: true,
        children: if children.is_empty() { None } else { Some(children) },
    })
}
