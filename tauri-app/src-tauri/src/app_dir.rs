use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs::OpenOptions;
use std::io::Write;
use chrono::Local;

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
            "active_provider_id": "provider_1",
            "llm_providers": [
                {
                    "id": "provider_1",
                    "name": "OpenAI",
                    "provider": "openai",
                    "api_key": "",
                    "base_url": "https://api.openai.com/v1",
                    "model": "gpt-4o"
                }
            ]
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

/// 单个 LLM 供应商配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMProviderEntry {
    pub id: String,
    pub name: String,
    pub provider: String,       // "openai" | "claude" | "ollama" | "gemini"
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub proxy: String,          // HTTP 代理地址，如 http://127.0.0.1:7890
    #[serde(default)]
    pub use_proxy: bool,        // 是否启用代理
}

/// LLM 配置结构（多供应商 + 激活项）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMConfig {
    pub active_provider_id: String,
    pub providers: Vec<LLMProviderEntry>,
}

/// 获取 LLM 配置（从 ~/.moyan/config.json 读取，自动迁移旧格式）
#[tauri::command]
pub fn get_config() -> Result<LLMConfig, String> {
    let config_path = get_moyan_dir()?.join("config.json");

    // 默认配置：一个 OpenAI 供应商
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

    if !config_path.exists() {
        return Ok(default_config);
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}));

    // 检测新格式
    if json.get("llm_providers").is_some() && json.get("active_provider_id").is_some() {
        let providers: Vec<LLMProviderEntry> = json["llm_providers"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| {
                        serde_json::from_value(v.clone()).ok()
                    })
                    .collect()
            })
            .unwrap_or_default();

        if providers.is_empty() {
            return Ok(default_config);
        }

        let active_id = json["active_provider_id"]
            .as_str()
            .unwrap_or("provider_1")
            .to_string();

        return Ok(LLMConfig {
            active_provider_id: active_id,
            providers,
        });
    }

    // 旧格式迁移：将 llm_provider/llm_model 等字段转为第一个 provider entry
    let old_provider = json["llm_provider"].as_str().unwrap_or("openai");
    let old_model = json["llm_model"].as_str().unwrap_or("gpt-4");
    let old_api_key = json["llm_api_key"].as_str().unwrap_or("");
    let old_base_url = json["llm_base_url"].as_str().unwrap_or("");
    let ollama_base_url = json["ollama_base_url"].as_str().unwrap_or("http://localhost:11434");
    let ollama_model = json["ollama_model"].as_str().unwrap_or("llama3");

    let mut providers = vec![];

    // 非 Ollama 的旧配置转为第一个 entry
    if old_provider != "ollama" {
        providers.push(LLMProviderEntry {
            id: "provider_1".to_string(),
            name: match old_provider {
                "claude" => "Claude".to_string(),
                _ => "OpenAI".to_string(),
            },
            provider: old_provider.to_string(),
            api_key: if old_api_key.is_empty() {
                String::new()
            } else {
                "***".to_string()
            },
            base_url: old_base_url.to_string(),
            model: old_model.to_string(),
            proxy: String::new(),
            use_proxy: false,
        });
    }

    // Ollama 配置转为第二个 entry（如果有）
    let ollama_id = if providers.is_empty() { "provider_1" } else { "provider_2" };
    providers.push(LLMProviderEntry {
        id: ollama_id.to_string(),
        name: "Ollama".to_string(),
        provider: "ollama".to_string(),
        api_key: String::new(),
        base_url: ollama_base_url.to_string(),
        model: ollama_model.to_string(),
        proxy: String::new(),
        use_proxy: false,
    });

    let active_id = if old_provider == "ollama" {
        ollama_id.to_string()
    } else {
        "provider_1".to_string()
    };

    // 自动写回新格式
    let new_json = serde_json::json!({
        "recent_projects": json.get("recent_projects").cloned().unwrap_or_else(|| serde_json::json!([])),
        "python_host": json.get("python_host").cloned().unwrap_or_else(|| serde_json::json!("127.0.0.1")),
        "python_port": json.get("python_port").cloned().unwrap_or_else(|| serde_json::json!(8765)),
        "active_provider_id": active_id,
        "llm_providers": providers.iter().map(|p| {
            serde_json::json!({
                "id": p.id,
                "name": p.name,
                "provider": p.provider,
                "api_key": if p.api_key == "***" { serde_json::Value::String(old_api_key.to_string()) } else { serde_json::Value::String(p.api_key.clone()) },
                "base_url": p.base_url,
                "model": p.model,
            })
        }).collect::<Vec<_>>(),
    });
    let new_content = serde_json::to_string_pretty(&new_json).map_err(|e| e.to_string())?;
    let _ = std::fs::write(&config_path, new_content);

    Ok(LLMConfig {
        active_provider_id: active_id,
        providers,
    })
}

/// 保存 LLM 配置（写入文件 + 同步到 Python 后端内存）
#[tauri::command]
pub async fn save_config(config: LLMConfig) -> Result<String, String> {
    let config_path = get_moyan_dir()?.join("config.json");

    // 读取现有配置（保留非 LLM 字段）
    let mut json: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // 写入新格式
    json["active_provider_id"] = serde_json::Value::String(config.active_provider_id.clone());
    json["llm_providers"] = serde_json::to_value(&config.providers).map_err(|e| e.to_string())?;

    // 清理旧格式字段（迁移后不再需要）
    json.as_object_mut().map(|obj| {
        obj.remove("llm_provider");
        obj.remove("llm_model");
        obj.remove("llm_base_url");
        obj.remove("llm_api_key");
        obj.remove("ollama_base_url");
        obj.remove("ollama_model");
    });

    let content = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;

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
            // API Key 只在非掩码时同步
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

/// 测试 LLM 连接（代理到 Python 后端的 /api/test_llm 端点）
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

    // 检查 HTTP 状态，避免解析 HTML 错误页
    if !resp.status().is_success() {
        return Err(format!(
            "Python 后端返回 HTTP {}，请确认后端已重启并加载最新代码",
            resp.status()
        ));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let status = body["status"].as_str().unwrap_or("error");
    let message = body["message"].as_str().unwrap_or("未知错误");

    if status == "ok" {
        Ok(message.to_string())
    } else {
        Err(message.to_string())
    }
}

/// 获取可用模型列表（代理到 Python 后端的 /api/list_models 端点）
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

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let status = body["status"].as_str().unwrap_or("error");
    if status != "ok" {
        let msg = body["message"].as_str().unwrap_or("未知错误");
        return Err(msg.to_string());
    }

    let models = body["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

/// 写入前端日志到文件
#[tauri::command]
pub fn write_log(level: String, message: String) -> Result<(), String> {
    let moyan_dir = get_moyan_dir()?;
    let log_dir = moyan_dir.join("logs");

    // 确保日志目录存在
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
