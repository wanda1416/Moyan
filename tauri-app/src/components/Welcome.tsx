import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface WelcomeProps {
  onOpenProject: (path: string) => void;
}

export default function Welcome({ onOpenProject }: WelcomeProps) {
  const [recentProjects, setRecentProjects] = useState<string[]>([]);

  // 加载最近项目
  const loadRecentProjects = async () => {
    try {
      const projects = await invoke<string[]>("get_recent_projects");
      setRecentProjects(projects);
    } catch (err) {
      console.error("加载最近项目失败:", err);
    }
  };

  useEffect(() => {
    loadRecentProjects();
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

  // 从最近项目列表移除
  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await invoke("remove_recent_project", { projectPath: path });
      setRecentProjects((prev) => prev.filter((p) => p !== path));
    } catch (err) {
      console.error("移除最近项目失败:", err);
    }
  };

  return (
    <div className="welcome-container">
      <div className="welcome-content">
        <div className="welcome-logo">
          <img src="/logo.png" alt="墨言" className="welcome-logo-img" />
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
                  <button
                    className="recent-remove"
                    onClick={(e) => handleRemoveRecent(e, project)}
                    title="从最近项目移除"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

