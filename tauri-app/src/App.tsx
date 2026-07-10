import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import TitleBar from "./components/TitleBar";
import FileTree from "./components/FileTree";
import Editor from "./components/Editor";
import AgentPanel from "./components/AgentPanel";
import Welcome from "./components/Welcome";
import Settings from "./components/Settings";
import "./styles.css";

function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
}

type Theme = "light" | "dark";

function App() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [theme, setTheme] = useState<Theme>("light");
  const [showSettings, setShowSettings] = useState(false);
  const expandedPathsRef = useRef<Set<string>>(new Set());
  const currentFileRef = useRef<string | null>(null);

  // 同步 currentFile 到 ref
  useEffect(() => {
    currentFileRef.current = currentFile;
  }, [currentFile]);

  // 保存项目状态（目录树展开 + 当前文件）
  const saveTreeState = useCallback(async () => {
    if (!projectRoot) return;
    try {
      const paths = Array.from(expandedPathsRef.current);
      await invoke("save_tree_state", {
        projectPath: projectRoot,
        expandedPaths: paths,
        currentFile: currentFileRef.current,
      });
    } catch {}
  }, [projectRoot]);

  // 加载主题配置和上次打开的项目
  useEffect(() => {
    invoke("init_app_dir").catch(console.error);
    
    // 加载主题
    invoke<Record<string, unknown>>("get_settings").then((settings) => {
      const saved = settings?.theme as Theme | undefined;
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
      }
    }).catch(() => {});
    
    // 加载上次打开的项目
    invoke<string | null>("get_last_project").then((lastProject) => {
      if (lastProject) {
        setProjectRoot(lastProject);
      }
    }).catch(() => {});
  }, []);

  // 应用主题到 DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 切换主题并保存
  const handleThemeChange = useCallback(async (newTheme: Theme) => {
    setTheme(newTheme);
    try {
      const settings = await invoke<Record<string, unknown>>("get_settings");
      settings.theme = newTheme;
      await invoke("save_settings", { settings: JSON.stringify(settings) });
    } catch {}
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

  const handleExpandedChange = useCallback((paths: Set<string>) => {
    expandedPathsRef.current = paths;
  }, []);

  // FileTree 加载完成后，恢复上次打开的文件
  const handleFileTreeReady = useCallback((savedFile: string | null) => {
    if (savedFile) {
      handleFileSelect(savedFile);
    }
  }, [handleFileSelect]);

  // 供 FileTree 防抖保存时获取当前文件
  const getCurrentFile = useCallback(() => currentFileRef.current, []);

  const handleOpenProject = async (path: string) => {
    await saveTreeState();
    setProjectRoot(path);
    setCurrentFile(null);
    setFileContent("");
    try {
      await invoke("add_recent_project", { projectPath: path });
      await invoke("set_last_project", { projectPath: path });
    } catch (err) {
      console.error("记录最近项目失败:", err);
    }
  };

  // 关闭项目
  const handleCloseProject = async () => {
    await saveTreeState();
    setProjectRoot(null);
    setCurrentFile(null);
    setFileContent("");
    try {
      await invoke("clear_last_project");
    } catch {}
  };

  // 菜单事件处理
  const handleMenuAction = useCallback(async (action: string) => {
    if (action === "open-project") {
      try {
        const path = await invoke<string | null>("open_directory");
        if (path) {
          await saveTreeState();
          setProjectRoot(path);
          setCurrentFile(null);
          setFileContent("");
          try {
            await invoke("add_recent_project", { projectPath: path });
            await invoke("set_last_project", { projectPath: path });
          } catch {}
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
    } else if (action === "set-theme-light") {
      handleThemeChange("light");
    } else if (action === "set-theme-dark") {
      handleThemeChange("dark");
    } else if (action === "open-settings") {
      setShowSettings(true);
    }
  }, [currentFile, fileContent, saveTreeState, handleThemeChange]);

  return (
    <div className="app-root">
      <TitleBar onMenuAction={handleMenuAction} theme={theme} />
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
                onClick={handleCloseProject}
              >
                ✕
              </button>
            </div>
            <FileTree
              projectRoot={projectRoot}
              onFileSelect={handleFileSelect}
              onExpandedChange={handleExpandedChange}
              onReady={handleFileTreeReady}
              getCurrentFile={getCurrentFile}
            />
          </aside>
          <main className="editor-area">
            <Editor filePath={currentFile} content={fileContent} onChange={handleContentChange} theme={theme} />
          </main>
          <aside className="agent-panel">
            <AgentPanel currentFile={currentFile} projectRoot={projectRoot} />
          </aside>
        </div>
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
