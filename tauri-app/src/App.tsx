import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import TitleBar from "./components/TitleBar";
import FileTree from "./components/FileTree";
import Editor from "./components/Editor";
import AgentPanel from "./components/AgentPanel";
import Welcome from "./components/Welcome";
import "./styles.css";

function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
}

function App() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");

  useEffect(() => {
    invoke("init_app_dir").catch(console.error);
  }, []);

  const handleFileSelect = useCallback(async (path: string) => {
    setCurrentFile(path);
    if (isImageFile(path)) {
      setFileContent("");
      return;
    }
    try {
      const content = await invoke<string>("read_file", { path });
      setFileContent(content);
    } catch (err) {
      console.error("读取文件失败:", err);
      setFileContent(`// 读取失败: ${err}`);
    }
  }, []);

  const handleContentChange = useCallback((value: string) => {
    setFileContent(value);
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentFile || isImageFile(currentFile)) return;
    try {
      await invoke("write_file", { path: currentFile, content: fileContent });
    } catch (err) {
      console.error("保存文件失败:", err);
    }
  }, [currentFile, fileContent]);

  // Ctrl+S 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const handleOpenProject = async (path: string) => {
    setProjectRoot(path);
    setCurrentFile(null);
    setFileContent("");
    try {
      await invoke("add_recent_project", { projectPath: path });
    } catch (err) {
      console.error("记录最近项目失败:", err);
    }
  };

  // 菜单事件处理
  const handleMenuAction = useCallback(async (action: string) => {
    if (action === "open-project") {
      try {
        const path = await invoke<string | null>("open_directory");
        if (path) {
          setProjectRoot(path);
          setCurrentFile(null);
          setFileContent("");
          try { await invoke("add_recent_project", { projectPath: path }); } catch {}
        }
      } catch (err) {
        console.error("打开目录失败:", err);
      }
    } else if (action === "save") {
      if (currentFile && !isImageFile(currentFile)) {
        try {
          await invoke("write_file", { path: currentFile, content: fileContent });
        } catch (err) {
          console.error("保存文件失败:", err);
        }
      }
    }
  }, [currentFile, fileContent]);

  return (
    <div className="app-root">
      <TitleBar onMenuAction={handleMenuAction} />
      {!projectRoot ? (
        <Welcome onOpenProject={handleOpenProject} />
      ) : (
        <div className="app-container">
          <aside className="sidebar">
            <div className="sidebar-header">
              <span className="project-name">{projectRoot.split(/[\\/]/).pop()}</span>
              <button
                className="btn-icon"
                title="切换项目"
                onClick={() => setProjectRoot(null)}
              >
                ✕
              </button>
            </div>
            <FileTree projectRoot={projectRoot} onFileSelect={handleFileSelect} />
          </aside>
          <main className="editor-area">
            <Editor filePath={currentFile} content={fileContent} onChange={handleContentChange} />
          </main>
          <aside className="agent-panel">
            <AgentPanel currentFile={currentFile} />
          </aside>
        </div>
      )}
    </div>
  );
}

export default App;
