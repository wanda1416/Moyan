import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";

/** 后端 updater.rs 返回的更新信息结构 */
interface UpdateInfo {
  has_update: boolean;
  current_version: string;
  latest_version: string;
  release_url: string;
  release_notes: string;
  published_at: string;
}

interface LLMProviderEntry {
  id: string;
  name: string;
  provider: string;
  api_key: string;
  base_url: string;
  model: string;
  proxy: string;
  use_proxy: boolean;
}

interface LLMConfig {
  active_provider_id: string;
  providers: LLMProviderEntry[];
}

interface EditorSettings {
  fontFamily: string;
  fontSize: number;
}

interface SettingsProps {
  /** 当前已应用的设置（应用后会被更新） */
  appliedSettings: EditorSettings;
  /** 应用后调用，返回是否成功 */
  onApplyEditor: (settings: EditorSettings) => Promise<boolean>;
  /** 报告是否有未保存的变更（用于关闭前检查） */
  onDirtyChange: (dirty: boolean) => void;
  /** 注册应用函数（供外部触发，如关闭确认对话框的"保存"按钮） */
  registerApply?: (fn: () => Promise<boolean>) => void;
  /** 初始选中的 Tab（默认 editor） */
  initialTab?: "editor" | "llm" | "about";
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI / 兼容 API",
  claude: "Claude (Anthropic)",
  ollama: "Ollama (本地)",
  gemini: "Gemini (Google)",
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  claude: "claude-sonnet-4-20250514",
  ollama: "llama3",
  gemini: "gemini-2.0-flash",
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  claude: "",
  ollama: "http://localhost:11434",
  gemini: "",
};

const FONT_OPTIONS = [
  { label: "默认（系统等宽）", value: "" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Source Code Pro", value: "'Source Code Pro', monospace" },
];

function genId() {
  return `provider_${crypto.randomUUID().slice(0, 8)}`;
}

export default function Settings({
  appliedSettings,
  onApplyEditor,
  onDirtyChange,
  registerApply,
  initialTab = "editor",
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<"editor" | "llm" | "about">(initialTab);

  // 编辑器设置（未保存的工作副本）
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(appliedSettings);
  const [editorMessage, setEditorMessage] = useState("");

  // LLM 设置
  const [providers, setProviders] = useState<LLMProviderEntry[]>([]);
  const [activeProviderId, setActiveProviderId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testing, setTesting] = useState(false);

  // 关于页
  const [currentVersion, setCurrentVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  // 已保存的 LLM 配置快照（用于检测变更）
  const llmSnapshotRef = useRef<string>("");

  // 当前正在编辑的供应商
  const editing = providers.find((p) => p.id === editingId) || null;

  // 加载配置
  const loadConfig = useCallback(async () => {
    try {
      // 加载 LLM 配置
      const data = await invoke<LLMConfig>("get_config");
      setProviders(data.providers);
      setActiveProviderId(data.active_provider_id);
      setEditingId(data.active_provider_id);

      // 加载编辑器设置
      const settings = await invoke<Record<string, unknown>>("get_settings");
      const editor = settings?.editor as Record<string, unknown> | undefined;
      if (editor) {
        setEditorSettings({
          fontFamily: (editor.fontFamily as string) || "",
          fontSize: (editor.fontSize as number) || 14,
        });
      }
    } catch (err) {
      setMessage(`加载配置失败: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 加载当前应用版本（仅一次）
  useEffect(() => {
    invoke<string>("app_version")
      .then((v) => setCurrentVersion(v))
      .catch((err) => console.warn("获取应用版本失败:", err));
  }, []);

  // 手动检查更新
  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    setUpdateMessage("");
    setUpdateInfo(null);
    try {
      const info = await invoke<UpdateInfo>("check_update");
      setUpdateInfo(info);
      if (info.has_update) {
        setUpdateMessage(`✓ 发现新版本 v${info.latest_version}`);
      } else {
        setUpdateMessage("✓ 已是最新版本");
      }
    } catch (err) {
      setUpdateMessage(`✗ 检查失败: ${err}`);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  // 打开 release 页面
  const handleOpenRelease = useCallback(async (url: string) => {
    try {
      await openExternal(url);
    } catch (err) {
      console.error("打开链接失败:", err);
    }
  }, []);

  // 保存编辑器设置（点击应用按钮时调用）
  const applyEditorSettings = useCallback(async () => {
    const fontSize = Math.min(24, Math.max(10, editorSettings.fontSize || 14));
    const finalSettings = { ...editorSettings, fontSize };
    setEditorSettings(finalSettings);
    const ok = await onApplyEditor(finalSettings);
    if (ok) {
      setEditorMessage("✓ 已应用");
      setTimeout(() => setEditorMessage(""), 2000);
    } else {
      setEditorMessage("✗ 保存失败");
    }
    return ok;
  }, [editorSettings, onApplyEditor]);

  // 注册应用函数供外部触发（关闭确认对话框的"保存"按钮）
  useEffect(() => {
    if (registerApply) {
      registerApply(() => applyEditorSettings());
    }
  }, [registerApply, applyEditorSettings]);

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
      base_url: "",
      model: "",
      proxy: "",
      use_proxy: false,
    };
    setProviders((prev) => [...prev, newEntry]);
    setEditingId(id);
    setAvailableModels([]);
    setMessage("");
  };

  // 删除供应商（需确认）
  const handleDelete = (id: string) => {
    if (providers.length <= 1) return;
    const provider = providers.find((p) => p.id === id);
    if (!provider) return;
    if (!window.confirm(`确定要删除「${provider.name}」吗？`)) return;

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

  // 保存 LLM 配置
  const handleSaveLLM = async () => {
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
      // 保存后更新快照
      llmSnapshotRef.current = JSON.stringify(config);
    } catch (err) {
      setMessage(`保存失败: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // 加载 LLM 配置后初始化快照
  useEffect(() => {
    if (!loading && providers.length >= 0 && !llmSnapshotRef.current) {
      llmSnapshotRef.current = JSON.stringify({
        active_provider_id: activeProviderId,
        providers,
      } as LLMConfig);
    }
  }, [loading, providers, activeProviderId]);

  // 检测编辑器/ LLM 变更
  useEffect(() => {
    const editorDirty =
      editorSettings.fontFamily !== appliedSettings.fontFamily ||
      editorSettings.fontSize !== appliedSettings.fontSize;
    const llmDirty = !!llmSnapshotRef.current &&
      llmSnapshotRef.current !== JSON.stringify({
        active_provider_id: activeProviderId,
        providers,
      } as LLMConfig);
    onDirtyChange(editorDirty || llmDirty);
  }, [editorSettings, appliedSettings, providers, activeProviderId, onDirtyChange]);

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
      setMessage(`✗ ${err}`);
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
    return <div className="settings-body">加载中...</div>;
  }

  return (
    <div className={activeTab === "llm" ? "settings-panel settings-panel-wide" : "settings-panel"}>

        {/* Tab 导航 */}
        <div className="settings-tabs">
          <button
            className={`settings-tab${activeTab === "editor" ? " active" : ""}`}
            onClick={() => setActiveTab("editor")}
          >
            编辑器
          </button>
          <button
            className={`settings-tab${activeTab === "llm" ? " active" : ""}`}
            onClick={() => setActiveTab("llm")}
          >
            LLM 供应商
          </button>
          <button
            className={`settings-tab${activeTab === "about" ? " active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            关于
          </button>
        </div>

        {/* 编辑器设置 */}
        {activeTab === "editor" && (
          <div className="settings-body">
            <div className="settings-section">
              <h3>字体</h3>
              <div className="settings-field">
                <label>字体族</label>
                <select
                  value={editorSettings.fontFamily}
                  onChange={(e) => setEditorSettings({ ...editorSettings, fontFamily: e.target.value })}
                >
                  {FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="settings-field">
                <label>字号</label>
                <div className="number-input-row">
                  <input
                    type="number"
                    min={10}
                    max={24}
                    value={editorSettings.fontSize}
                    onChange={(e) => setEditorSettings({ ...editorSettings, fontSize: Number(e.target.value) || 0 })}
                  />
                  <span className="number-input-unit">px（10 - 24）</span>
                </div>
              </div>
            </div>
            {editorMessage && (
              <div className={`settings-message ${editorMessage.startsWith("✗") ? "error" : "success"}`}>
                {editorMessage}
              </div>
            )}
            <div className="settings-actions">
              <button className="btn-primary" onClick={applyEditorSettings}>
                应用
              </button>
            </div>
          </div>
        )}

        {/* LLM 供应商设置 */}
        {activeTab === "llm" && (
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
                        >✕</button>
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
                  <div className="provider-edit-header">
                    <span className="provider-edit-title">{editing.name || "未命名供应商"}</span>
                    {editing.id !== activeProviderId && (
                      <button
                        className="btn-activate"
                        onClick={() => handleActivate(editing.id)}
                      >
                        设为默认供应商
                      </button>
                    )}
                  </div>
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
                            base_url: DEFAULT_BASE_URLS[newProvider] || "",
                            model: DEFAULT_MODELS[newProvider] || "",
                          });
                          setAvailableModels([]);
                        }}
                      >
                        <option value="openai">OpenAI / 兼容 API</option>
                        <option value="claude">Claude (Anthropic)</option>
                        <option value="ollama">Ollama (本地)</option>
                        <option value="gemini">Gemini (Google)</option>
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
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={editing.use_proxy || false}
                          onChange={(e) => updateEditing({ use_proxy: e.target.checked })}
                        />
                        使用 HTTP 代理
                      </label>
                      {editing.use_proxy && (
                        <input
                          type="text"
                          value={editing.proxy || ""}
                          onChange={(e) => updateEditing({ proxy: e.target.value })}
                          placeholder="http://127.0.0.1:7890"
                        />
                      )}
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
                </>
              ) : (
                <div className="provider-edit-empty">选择一个供应商进行编辑</div>
              )}

              {message && (
                <div className={`settings-message ${message.startsWith("✗") || message.includes("失败") ? "error" : "success"}`}>
                  {message}
                </div>
              )}

              <div className="settings-actions">
                <button className="btn-secondary" onClick={handleTest} disabled={testing || !editing}>
                  {testing ? "测试中..." : "测试连接"}
                </button>
                <button className="btn-primary" onClick={handleSaveLLM} disabled={saving}>
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 关于 Tab */}
        {activeTab === "about" && (
          <div className="settings-body">
            <div className="settings-section">
              <h3>墨言</h3>
              <p className="settings-about-desc">
                AI 小说协作桌面应用。使用 LLM Agent 帮你持续追踪人物、世界观、伏笔和剧情节拍。
              </p>
            </div>

            <div className="settings-section">
              <h3>版本信息</h3>
              <div className="settings-field">
                <label>当前版本</label>
                <div className="settings-version-value">v{currentVersion || "..."}</div>
              </div>
              {updateInfo && (
                <div className="settings-field">
                  <label>最新版本</label>
                  <div className="settings-version-value">
                    v{updateInfo.latest_version}
                    {updateInfo.has_update && (
                      <span className="settings-version-badge">有可用更新</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="settings-section">
              <h3>检查更新</h3>
              <div className="settings-about-actions">
                <button
                  className="btn-primary"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                >
                  {checkingUpdate ? "检查中..." : "检查更新"}
                </button>
                {updateInfo?.has_update && updateInfo.release_url && (
                  <button
                    className="btn-secondary"
                    onClick={() => handleOpenRelease(updateInfo.release_url)}
                  >
                    前往下载页
                  </button>
                )}
              </div>
              {updateMessage && (
                <div className={`settings-message ${updateMessage.startsWith("✗") ? "error" : "success"}`}>
                  {updateMessage}
                </div>
              )}
            </div>

            <div className="settings-section">
              <h3>许可协议</h3>
              <p className="settings-about-desc">
                AGPL-3.0-only WITH Non-Commercial Restriction<br />
                本仓库仅供非商业使用。
              </p>
            </div>
          </div>
        )}
    </div>
  );
}
