import { useState, useCallback, useRef } from "react";
import EditorTab from "./settings/EditorTab";
import LLMTab from "./settings/LLMTab";
import AboutTab from "./settings/AboutTab";

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

export default function Settings({
  appliedSettings,
  onApplyEditor,
  onDirtyChange,
  registerApply,
  initialTab = "editor",
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<"editor" | "llm" | "about">(initialTab);

  // 编辑器 Tab 的 apply 注册
  const editorApplyRef = useRef<(() => Promise<boolean>) | null>(null);

  const handleEditorDirty = useCallback((dirty: boolean) => {
    onDirtyChange(dirty);
  }, [onDirtyChange]);

  const handleLLMDirty = useCallback((dirty: boolean) => {
    onDirtyChange(dirty);
  }, [onDirtyChange]);

  // 注册编辑器 apply 函数
  const handleRegisterApply = useCallback((fn: () => Promise<boolean>) => {
    editorApplyRef.current = fn;
    if (registerApply) {
      registerApply(fn);
    }
  }, [registerApply]);

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
          <EditorTab
            appliedSettings={appliedSettings}
            onApply={onApplyEditor}
            onDirtyChange={handleEditorDirty}
            registerApply={handleRegisterApply}
          />
        )}

        {/* LLM 供应商设置 */}
        {activeTab === "llm" && (
          <LLMTab onDirtyChange={handleLLMDirty} />
        )}

        {/* 关于 Tab */}
        {activeTab === "about" && (
          <AboutTab />
        )}
    </div>
  );
}
