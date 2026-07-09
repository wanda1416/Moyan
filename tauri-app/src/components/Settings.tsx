import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface LLMConfig {
  llm_provider: string;
  llm_model: string;
  llm_base_url: string;
  llm_api_key: string;
  ollama_base_url: string;
  ollama_model: string;
}

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [config, setConfig] = useState<LLMConfig>({
    llm_provider: "openai",
    llm_model: "gpt-4",
    llm_base_url: "",
    llm_api_key: "",
    ollama_base_url: "http://localhost:11434",
    ollama_model: "llama3",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // 加载配置
  const loadConfig = useCallback(async () => {
    try {
      const data = await invoke<LLMConfig>("get_config");
      setConfig(data);
    } catch (err) {
      setMessage(`加载配置失败: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await invoke<string>("save_config", { config });
      setMessage("配置已保存");
    } catch (err) {
      setMessage(`保存失败: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // 测试连接
  const handleTest = async () => {
    setMessage("");
    try {
      const result = await invoke<string>("test_llm_connection");
      setMessage(`连接成功: ${result}`);
    } catch (err) {
      setMessage(`连接失败: ${err}`);
    }
  };

  if (loading) {
    return (
      <div className="settings-overlay">
        <div className="settings-panel">
          <div className="settings-header">
            <h2>设置</h2>
            <button className="settings-close" onClick={onClose}>✕</button>
          </div>
          <div className="settings-body">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <h3>LLM 配置</h3>

            <div className="settings-field">
              <label>Provider</label>
              <select
                value={config.llm_provider}
                onChange={(e) => setConfig({ ...config, llm_provider: e.target.value })}
              >
                <option value="openai">OpenAI / 兼容 API</option>
                <option value="claude">Claude (Anthropic)</option>
                <option value="ollama">Ollama (本地)</option>
              </select>
            </div>

            {config.llm_provider === "ollama" ? (
              <>
                <div className="settings-field">
                  <label>Ollama Base URL</label>
                  <input
                    type="text"
                    value={config.ollama_base_url}
                    onChange={(e) => setConfig({ ...config, ollama_base_url: e.target.value })}
                    placeholder="http://localhost:11434"
                  />
                </div>
                <div className="settings-field">
                  <label>Ollama 模型</label>
                  <input
                    type="text"
                    value={config.ollama_model}
                    onChange={(e) => setConfig({ ...config, ollama_model: e.target.value })}
                    placeholder="llama3"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="settings-field">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={config.llm_api_key === "***" ? "" : config.llm_api_key}
                    onChange={(e) => setConfig({ ...config, llm_api_key: e.target.value })}
                    placeholder={config.llm_api_key === "***" ? "已保存 (留空保持不变)" : "sk-..."}
                  />
                </div>
                <div className="settings-field">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value={config.llm_base_url}
                    onChange={(e) => setConfig({ ...config, llm_base_url: e.target.value })}
                    placeholder={config.llm_provider === "openai" ? "https://api.openai.com/v1" : "自定义 API 地址"}
                  />
                </div>
                <div className="settings-field">
                  <label>模型名称</label>
                  <input
                    type="text"
                    value={config.llm_model}
                    onChange={(e) => setConfig({ ...config, llm_model: e.target.value })}
                    placeholder={config.llm_provider === "openai" ? "gpt-4" : "claude-sonnet-4-20250514"}
                  />
                </div>
              </>
            )}
          </div>

          {message && (
            <div className={`settings-message ${message.includes("失败") ? "error" : "success"}`}>
              {message}
            </div>
          )}

          <div className="settings-actions">
            <button className="btn-secondary" onClick={handleTest}>
              测试连接
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
