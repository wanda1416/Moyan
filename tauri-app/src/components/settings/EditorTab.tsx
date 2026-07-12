import { useState, useCallback, useEffect } from "react";

interface EditorSettings {
  fontFamily: string;
  fontSize: number;
}

interface EditorTabProps {
  appliedSettings: EditorSettings;
  onApply: (settings: EditorSettings) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
  registerApply?: (fn: () => Promise<boolean>) => void;
}

const FONT_OPTIONS = [
  { label: "默认（系统等宽）", value: "" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Source Code Pro", value: "'Source Code Pro', monospace" },
];

export default function EditorTab({ appliedSettings, onApply, onDirtyChange, registerApply }: EditorTabProps) {
  const [settings, setSettings] = useState<EditorSettings>(appliedSettings);
  const [message, setMessage] = useState("");

  const apply = useCallback(async () => {
    const fontSize = Math.min(24, Math.max(10, settings.fontSize || 14));
    const finalSettings = { ...settings, fontSize };
    setSettings(finalSettings);
    const ok = await onApply(finalSettings);
    if (ok) {
      setMessage("✓ 已应用");
      setTimeout(() => setMessage(""), 2000);
    } else {
      setMessage("✗ 保存失败");
    }
    return ok;
  }, [settings, onApply]);

  useEffect(() => {
    if (registerApply) {
      registerApply(() => apply());
    }
  }, [registerApply, apply]);

  useEffect(() => {
    const dirty =
      settings.fontFamily !== appliedSettings.fontFamily ||
      settings.fontSize !== appliedSettings.fontSize;
    onDirtyChange(dirty);
  }, [settings, appliedSettings, onDirtyChange]);

  return (
    <div className="settings-body">
      <div className="settings-section">
        <h3>字体</h3>
        <div className="settings-field">
          <label>字体族</label>
          <select
            value={settings.fontFamily}
            onChange={(e) => setSettings({ ...settings, fontFamily: e.target.value })}
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
              value={settings.fontSize}
              onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) || 0 })}
            />
            <span className="number-input-unit">px（10 - 24）</span>
          </div>
        </div>
      </div>
      {message && (
        <div className={`settings-message ${message.startsWith("✗") ? "error" : "success"}`}>
          {message}
        </div>
      )}
      <div className="settings-actions">
        <button className="btn-primary" onClick={apply}>
          应用
        </button>
      </div>
    </div>
  );
}
