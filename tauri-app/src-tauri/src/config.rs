#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// 项目根目录
    pub project_root: Option<String>,
    /// Python Agent 配置
    pub python_host: String,
    pub python_port: u16,
    /// LLM 配置
    pub llm_provider: String,
    pub llm_api_key: Option<String>,
    pub llm_model: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            project_root: None,
            python_host: "127.0.0.1".to_string(),
            python_port: 8765,
            llm_provider: "openai".to_string(),
            llm_api_key: None,
            llm_model: None,
        }
    }
}

/// 加载配置文件
pub fn load_config() -> Result<AppConfig, String> {
    let config_path = get_config_path()?;
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(AppConfig::default())
    }
}

/// 保存配置文件
pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let config_path = get_config_path()?;
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())
}

/// 获取配置文件路径
fn get_config_path() -> Result<PathBuf, String> {
    let app_dir = dirs::config_dir()
        .ok_or_else(|| "无法获取配置目录".to_string())?
        .join("novel-agent");

    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

    Ok(app_dir.join("config.json"))
}
