import { useState, useEffect, useCallback } from "react";
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

export default function AboutTab() {
  const [currentVersion, setCurrentVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  useEffect(() => {
    invoke<string>("app_version")
      .then((v) => setCurrentVersion(v))
      .catch((err) => console.warn("获取应用版本失败:", err));
  }, []);

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

  const handleOpenRelease = useCallback(async (url: string) => {
    try {
      await openExternal(url);
    } catch (err) {
      console.error("打开链接失败:", err);
    }
  }, []);

  return (
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
  );
}
