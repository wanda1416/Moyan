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

/// 获取项目目录树
#[tauri::command]
pub fn get_project_tree() -> Result<FileNode, String> {
    // TODO: 从配置中读取项目根目录
    let root = std::env::current_dir().map_err(|e| e.to_string())?;
    build_tree(&root)
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
