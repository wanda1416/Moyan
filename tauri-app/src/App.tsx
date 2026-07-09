import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import FileTree from "./components/FileTree";
import Editor from "./components/Editor";
import AgentPanel from "./components/AgentPanel";
import Welcome from "./components/Welcome";
import "./styles.css";

// 判断是否为二进制图片文件
function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
}

function App() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");

  // 启动时初始化 ~/.moyan
  useEffect(() => {
    invoke("init_app_dir").catch(console.error);
  }, []);

  // 文件选择处理：自动加载文本内容
  const handleFileSelect = useCallback(async (path: string) => {
    setCurrentFile(path);

    // 图片文件由 Editor 组件自己通过 base64 加载
    if (isImageFile(path)) {
      setFileContent("");
      return;
    }

    // 文本/markdown 文件：读取内容
    try {
      const content = await invoke<string>("read_file", { path });
      setFileContent(content);
    } catch (err) {
      console.error("读取文件失败:", err);
      setFileContent(`// 读取失败: ${err}`);
    }
  }, []);

  // 保存文件
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

  // Ctrl+S 保存快捷键
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

  // 未打开项目时显示欢迎页
  if (!projectRoot) {
    return <Welcome onOpenProject={handleOpenProject} />;
  }

  return (
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
  );
}

export default App;
