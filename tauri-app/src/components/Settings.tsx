import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface LLMProviderEntry {
  id: string;
  name: string;
  provider: string;
  api_key: string;
  base_url: string;
  model: string;
}

interface LLMConfig {
  active_provider_id: string;
  providers: LLMProviderEntry[];
}

interface SettingsProps {
  onClose: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI / 兼容 API",
  claude: "Claude (Anthropic)",
  ollama: "Ollama (本地)",
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  claude: "claude-sonnet-4-20250514",
  ollama: "llama3",
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  claude: "",
  ollama: "http://localhost:11434",
};

let idCounter = 2;
function genId() {
  return `provider_${idCounter++}`;
}

export default function Settings({ onClose }: SettingsProps) {
  const [providers, setProviders] = useState<LLMProviderEntry[]>([]);
  const [activeProviderId, setActiveProviderId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testing, setTesting] = useState(false);

  // 当前正在编辑的供应商
  const editing = providers.find((p) => p.id === editingId) || null;

  // 加载配置
  const loadConfig = useCallback(async () => {
    try {
      const data = await invoke<LLMConfig>("get_config");
      setProviders(data.providers);
      setActiveProviderId(data.active_provider_id);
      // 默认编辑激活的供应商
      setEditingId(data.active_provider_id);
    } catch (err) {
      setMessage(`加载配置失败: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 更新当前编辑的供应商
  const updateEditing = (patch: Partial<LLMProviderEntry>) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === editingId ? { ...p, ...patch } : p))
    );
  };

  // 添加新供应商
  const handleAdd = () => {
    const id = genId();
    const newEntry: LLMProviderEntry = {
      id,
      name: "新供应商",
      provider: "openai",
      api_key: "",
      base_url: DEFAULT_BASE_URLS.openai,
      model: DEFAULT_MODELS.openai,
    };
    setProviders((prev) => [...prev, newEntry]);
    setEditingId(id);
    setAvailableModels([]);
    setMessage("");
  };

  // 删除供应商
  const handleDelete = (id: string) => {
    if (providers.length <= 1) return;
    setProviders((prev) => prev.filter((p) => p.id !== id));
    if (editingId === id) {
      const remaining = providers.filter((p) => p.id !== id);
      setEditingId(remaining[0]?.id || "");
    }
    if (activeProviderId === id) {
      const remaining = providers.filter((p) => p.id !== id);
      setActiveProviderId(remaining[0]?.id || "");
    }
    setAvailableModels([]);
    setMessage("");
  };

  // 设为激活
  const handleActivate = (id: string) => {
    setActiveProviderId(id);
    setEditingId(id);
    setAvailableModels([]);
    setMessage("");
  };

  // 切换编辑对象
  const handleSelect = (id: string) => {
    setEditingId(id);
    setAvailableModels([]);
    setMessage("");
  };

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const config: LLMConfig = {
        active_provider_id: activeProviderId,
        providers,
      };
      const result = await invoke<string>("save_config", { config });
      if (result.startsWith("saved_no_sync")) {
        const msg = result.split("|")[1] || "Python 后端未运行";
        setMessage(`⚠ 配置已保存，但 ${msg}`);
      } else {
        setMessage("✓ 配置已保存");
      }
    } catch (err) {
      setMessage(`保存失败: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // 测试连接（成功后自动拉取模型列表）
  const handleTest = async () => {
    if (!editing) return;
    setMessage("");
    setTesting(true);
    try {
      const result = await invoke<string>("test_llm_connection", { entry: editing });
      setMessage(`✓ ${result}`);
      await fetchModels(editing);
    } catch (err) {
      setMessage(` ${err}`);
    } finally {
      setTesting(false);
    }
  };

  // 拉取可用模型列表
  const fetchModels = async (entry?: LLMProviderEntry) => {
    const target = entry || editing;
    if (!target) return;
    setFetchingModels(true);
    try {
      const models = await invoke<string[]>("list_models", { entry: target });
      setAvailableModels(models);
      if (models.length > 0 && !models.includes(target.model)) {
        updateEditing({ model: models[0] });
      }
    } catch {
      // 拉取失败不影响使用
    } finally {
      setFetchingModels(false);
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
      <div className="settings-panel settings-panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-body settings-body-split">
          {/* 左侧：供应商列表 */}
          <div className="provider-list-panel">
            <div className="provider-list-header">
              <span>LLM 供应商</span>
            </div>
            <div className="provider-list">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className={`provider-list-item ${p.id === editingId ? "selected" : ""} ${p.id === activeProviderId ? "active" : ""}`}
                  onClick={() => handleSelect(p.id)}
                >
                  <div className="provider-item-info">
                    <span className="provider-item-name">{p.name}</span>
                    <span className="provider-item-type">{PROVIDER_LABELS[p.provider] || p.provider}</span>
                  </div>
                  <div className="provider-item-actions">
                    {p.id === activeProviderId && <span className="provider-active-badge">默认</span>}
                    {providers.length > 1 && (
                      <button
                        className="provider-delete-btn"
                        onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                        title="删除"
                      ></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button className="provider-add-btn" onClick={handleAdd}>+ 添加供应商</button>
          </div>

          {/* 右侧：编辑面板 */}
          <div className="provider-edit-panel">
            {editing ? (
              <>
                <div className="settings-section">
                  <div className="settings-field">
                    <label>名称</label>
                    <input
                      type="text"
                      value={editing.name}
                      onChange={(e) => updateEditing({ name: e.target.value })}
                      placeholder="供应商名称"
                    />
                  </div>

                  <div className="settings-field">
                    <label>类型</label>
                    <select
                      value={editing.provider}
                      onChange={(e) => {
                        const newProvider = e.target.value;
                        updateEditing({
                          provider: newProvider,
                          base_url: editing.base_url || DEFAULT_BASE_URLS[newProvider] || "",
                          model: editing.model || DEFAULT_MODELS[newProvider] || "",
                        });
                        setAvailableModels([]);
                      }}
                    >
                      <option value="openai">OpenAI / 兼容 API</option>
                      <option value="claude">Claude (Anthropic)</option>
                      <option value="ollama">Ollama (本地)</option>
                    </select>
                  </div>

                  {editing.provider !== "ollama" && (
                    <div className="settings-field">
                      <label>API Key</label>
                      <input
                        type="password"
                        value={editing.api_key === "***" ? "" : editing.api_key}
                        onChange={(e) => updateEditing({ api_key: e.target.value })}
                        placeholder={editing.api_key === "***" ? "已保存 (留空保持不变)" : "sk-..."}
                      />
                    </div>
                  )}

                  <div className="settings-field">
                    <label>Base URL</label>
                    <input
                      type="text"
                      value={editing.base_url}
                      onChange={(e) => updateEditing({ base_url: e.target.value })}
                      placeholder={
                        editing.provider === "openai" ? "https://api.openai.com/v1" :
                        editing.provider === "ollama" ? "http://localhost:11434" :
                        "自定义 API 地址"
                      }
                    />
                  </div>

                  <div className="settings-field">
                    <label>模型</label>
                    <div className="model-input-row">
                      {availableModels.length > 0 ? (
                        <select
                          value={editing.model}
                          onChange={(e) => updateEditing({ model: e.target.value })}
                        >
                          {availableModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={editing.model}
                          onChange={(e) => updateEditing({ model: e.target.value })}
                          placeholder={DEFAULT_MODELS[editing.provider] || "模型名称"}
                        />
                      )}
                      <button
                        className="btn-icon"
                        onClick={() => fetchModels()}
                        disabled={fetchingModels}
                        title="获取模型列表"
                      >
                        {fetchingModels ? "⟳" : "↻"}
                      </button>
                    </div>
                  </div>
                </div>

                {editing.id !== activeProviderId && (
                  <button
                    className="btn-activate"
                    onClick={() => handleActivate(editing.id)}
                  >
                    设为默认供应商
                  </button>
                )}
              </>
            ) : (
              <div className="provider-edit-empty">选择一个供应商进行编辑</div>
            )}

            {message && (
              <div className={`settings-message ${message.startsWith("✗") || message.includes("失败") ? "error" : message.startsWith("") ? "warning" : "success"}`}>
                {message}
              </div>
            )}

            <div className="settings-actions">
              <button className="btn-secondary" onClick={handleTest} disabled={testing || !editing}>
                {testing ? "测试中..." : "测试连接"}
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
