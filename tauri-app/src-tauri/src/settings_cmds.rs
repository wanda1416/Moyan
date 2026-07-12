use serde::{Deserialize, Serialize};

use crate::app_dir::get_settings_path;

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
// LLM 配置（读写 settings.json 中的 LLM 部分）
// ============================================================

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
