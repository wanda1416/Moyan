import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface WelcomeProps {
  onOpenProject: (path: string) => void;
}

interface AppConfig {
  recent_projects?: string[];
}

export default function Welcome({ onOpenProject }: WelcomeProps) {
  const [recentProjects, setRecentProjects] = useState<string[]>([]);

  useEffect(() => {
    invoke<AppConfig>("read_app_config")
      .then((config) => {
        setRecentProjects(config.recent_projects || []);
      })
      .catch(console.error);
  }, []);

  const handleOpenDirectory = async () => {
    try {
      const path = await invoke<string | null>("open_directory");
      if (path) {
        onOpenProject(path);
      }
    } catch (err) {
      console.error("打开目录失败:", err);
    }
  };

  const handleRecentClick = (path: string) => {
    onOpenProject(path);
  };

  return (
    <div className="welcome-container">
      <div className="welcome-content">
        <div className="welcome-logo">
          <span className="welcome-icon">墨</span>
        </div>
        <h1 className="welcome-title">墨言</h1>
        <p className="welcome-subtitle">AI 小说协作</p>

        <div className="welcome-actions">
          <button className="welcome-btn primary" onClick={handleOpenDirectory}>
            打开项目目录
          </button>
        </div>

        {recentProjects.length > 0 && (
          <div className="welcome-recent">
            <h3>最近项目</h3>
            <ul className="recent-list">
              {recentProjects.map((project) => (
                <li key={project} className="recent-item" onClick={() => handleRecentClick(project)}>
                  <span className="recent-icon">📁</span>
                  <span className="recent-path">{project}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
