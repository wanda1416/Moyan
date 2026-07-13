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

// ============================================================
// 文件操作命令（新建、删除、重命名、复制）
// ============================================================

/// 创建新文件
#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        return Err(format!("文件已存在: {}", p.file_name().unwrap_or_default().to_string_lossy()));
    }
    // 确保父目录存在
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            return Err("父目录不存在".to_string());
        }
    }
    std::fs::File::create(&p).map_err(|e| format!("创建文件失败: {}", e))?;
    Ok(())
}

/// 创建新目录
#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        return Err(format!("目录已存在: {}", p.file_name().unwrap_or_default().to_string_lossy()));
    }
    std::fs::create_dir_all(&p).map_err(|e| format!("创建目录失败: {}", e))?;
    Ok(())
}

/// 删除文件或目录
#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("文件或目录不存在".to_string());
    }
    if p.is_dir() {
        std::fs::remove_dir_all(&p).map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        std::fs::remove_file(&p).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    Ok(())
}

/// 重命名/移动文件或目录
#[tauri::command]
pub fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    let old = PathBuf::from(&old_path);
    let new = PathBuf::from(&new_path);
    if !old.exists() {
        return Err("源文件不存在".to_string());
    }
    if new.exists() {
        return Err(format!("目标已存在: {}", new.file_name().unwrap_or_default().to_string_lossy()));
    }
    std::fs::rename(&old, &new).map_err(|e| format!("重命名失败: {}", e))?;
    Ok(())
}

/// 复制文件或目录
#[tauri::command]
pub fn copy_entry(src: String, dst: String) -> Result<(), String> {
    let s = PathBuf::from(&src);
    let d = PathBuf::from(&dst);
    if !s.exists() {
        return Err("源文件不存在".to_string());
    }
    if d.exists() {
        return Err(format!("目标已存在: {}", d.file_name().unwrap_or_default().to_string_lossy()));
    }
    if s.is_dir() {
        copy_dir_recursive(&s, &d).map_err(|e| format!("复制目录失败: {}", e))?;
    } else {
        std::fs::copy(&s, &d).map_err(|e| format!("复制文件失败: {}", e))?;
    }
    Ok(())
}

/// 递归复制目录
fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 搜索结果项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub parent_path: String,
}

/// 在项目目录中搜索文件/文件夹（模糊匹配文件名）
#[tauri::command]
pub fn search_files(root: String, query: String) -> Result<Vec<SearchResult>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err("项目目录不存在".to_string());
    }
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    search_recursive(&root_path, &query_lower, &mut results)?;
    results.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(results)
}

fn search_recursive(
    dir: &PathBuf,
    query: &str,
    results: &mut Vec<SearchResult>,
) -> Result<(), String> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut sorted: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        sorted.sort_by_key(|e| e.file_name());

        for entry in sorted {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // 跳过隐藏文件和 node_modules
            if file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" {
                continue;
            }

            // 模糊匹配：文件名包含查询字符串（不区分大小写）
            if file_name.to_lowercase().contains(query) {
                let parent = path.parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                results.push(SearchResult {
                    name: file_name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: path.is_dir(),
                    parent_path: parent,
                });
            }

            // 递归子目录
            if path.is_dir() {
                search_recursive(&path, query, results)?;
            }
        }
    }
    Ok(())
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
