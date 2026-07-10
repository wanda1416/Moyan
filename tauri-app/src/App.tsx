import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import TitleBar from "./components/TitleBar";
import FileTree from "./components/FileTree";
import Editor, { getFileType, countWords } from "./components/Editor";
import AgentPanel from "./components/AgentPanel";
import Welcome from "./components/Welcome";
import Settings from "./components/Settings";
import TabBar from "./components/TabBar";
import StatusBar from "./components/StatusBar";
import "./styles.css";

function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
}

type Theme = "light" | "dark";

interface TabData {
  path: string;
  content: string;
  savedContent: string;
  mdMode: "preview" | "source";
}

// 面板宽度默认值
const DEFAULT_SIDEBAR_WIDTH = 260;
const DEFAULT_AGENT_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 150;
const MIN_AGENT_WIDTH = 200;

function App() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [agentWidth, setAgentWidth] = useState(DEFAULT_AGENT_WIDTH);

  // 多标签状态
  const [openTabs, setOpenTabs] = useState<TabData[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  const expandedPathsRef = useRef<Set<string>>(new Set());
  const resizingRef = useRef<"sidebar" | "agent" | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // 获取当前激活的标签数据
  const activeTab = openTabs.find((t) => t.path === activeTabPath) || null;
  const currentFile = activeTabPath;
  const fileContent = activeTab?.content || "";
  const mdMode = activeTab?.mdMode || "preview";

  // 更新当前标签的 mdMode
  const setMdMode = useCallback((mode: "preview" | "source") => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.path === activeTabPath ? { ...t, mdMode: mode } : t))
    );
  }, [activeTabPath]);

  // 同步 currentFile 到 ref（供 saveTreeState 使用）
  const currentFileRef = useRef<string | null>(null);
  useEffect(() => {
    currentFileRef.current = currentFile;
  }, [currentFile]);

  // 面板拖拽调整宽度
  const handleResizeStart = useCallback((target: "sidebar" | "agent", e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = target;
    startXRef.current = e.clientX;
    startWidthRef.current = target === "sidebar" ? sidebarWidth : agentWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth, agentWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - startXRef.current;
      if (resizingRef.current === "sidebar") {
        const newWidth = Math.max(MIN_SIDEBAR_WIDTH, startWidthRef.current + delta);
        setSidebarWidth(newWidth);
      } else {
        const newWidth = Math.max(MIN_AGENT_WIDTH, startWidthRef.current - delta);
        setAgentWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // 保存项目状态（目录树展开 + 当前文件 + 打开的标签页）
  const saveTreeState = useCallback(async () => {
    if (!projectRoot) return;
    try {
      const paths = Array.from(expandedPathsRef.current);
      const tabsInfo = openTabs.map((t) => ({ path: t.path, md_mode: t.mdMode }));
      await invoke("save_tree_state", {
        projectPath: projectRoot,
        expandedPaths: paths,
        currentFile: currentFileRef.current,
        openTabs: tabsInfo,
      });
    } catch {}
  }, [projectRoot, openTabs]);

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

  // 选择文件（打开或切换标签）
  const handleFileSelect = useCallback(async (path: string) => {
    setOpenTabs((prev) => {
      const existing = prev.find((t) => t.path === path);
      if (existing) {
        // 已打开，直接切换
        setActiveTabPath(path);
        return prev;
      }
      // 新标签
      return [...prev, { path, content: "", savedContent: "", mdMode: "preview" }];
    });
    setActiveTabPath(path);

    // 读取文件内容
    if (isImageFile(path)) return;
    try {
      const content = await invoke<string>("read_file", { path });
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === path ? { ...t, content, savedContent: content } : t
        )
      );
    } catch (err) {
      console.error("读取文件失败:", err);
      const errorContent = `// 读取失败: ${err}`;
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === path ? { ...t, content: errorContent, savedContent: errorContent } : t
        )
      );
    }
  }, []);

  // 内容变更
  const handleContentChange = useCallback((value: string) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.path === activeTabPath ? { ...t, content: value } : t))
    );
  }, [activeTabPath]);

  // 关闭标签
  const handleCloseTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const tab = prev.find((t) => t.path === path);
      if (tab && tab.content !== tab.savedContent) {
        const confirmed = window.confirm(`"${path.split(/[\\/]/).pop()}" 有未保存的更改，确定关闭吗？`);
        if (!confirmed) return prev;
      }

      const idx = prev.findIndex((t) => t.path === path);
      const newTabs = prev.filter((t) => t.path !== path);

      // 如果关闭的是当前激活标签，切换到相邻标签
      if (path === activeTabPath) {
        if (newTabs.length === 0) {
          setActiveTabPath(null);
        } else if (idx >= newTabs.length) {
          setActiveTabPath(newTabs[newTabs.length - 1].path);
        } else {
          setActiveTabPath(newTabs[idx].path);
        }
      }
      return newTabs;
    });
  }, [activeTabPath]);

  // 保存当前文件
  const handleSave = useCallback(async () => {
    if (!activeTabPath || isImageFile(activeTabPath)) return;
    try {
      await invoke("write_file", { path: activeTabPath, content: fileContent });
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === activeTabPath ? { ...t, savedContent: t.content } : t
        )
      );
    } catch (err) {
      console.error("保存文件失败:", err);
    }
  }, [activeTabPath, fileContent]);

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

  // FileTree 加载完成后，恢复上次打开的所有标签页
  const handleFileTreeReady = useCallback(async (savedFile: string | null, openTabsInfo: { path: string; md_mode?: string }[]) => {
    if (openTabsInfo.length === 0) {
      // 没有保存的标签页，尝试恢复单个文件
      if (savedFile) {
        handleFileSelect(savedFile);
      }
      return;
    }

    // 批量打开所有标签页
    const tabsData: TabData[] = [];
    for (const tabInfo of openTabsInfo) {
      const path = tabInfo.path;
      let content = "";
      if (!isImageFile(path)) {
        try {
          content = await invoke<string>("read_file", { path });
        } catch {
          content = `// 读取失败`;
        }
      }
      tabsData.push({
        path,
        content,
        savedContent: content,
        mdMode: tabInfo.md_mode === "source" ? "source" : "preview",
      });
    }
    setOpenTabs(tabsData);

    // 恢复激活的标签页
    const tabPaths = openTabsInfo.map((t) => t.path);
    const activePath = savedFile && tabPaths.includes(savedFile) ? savedFile : tabPaths[tabPaths.length - 1];
    setActiveTabPath(activePath);
  }, [handleFileSelect]);

  // 供 FileTree 防抖保存时获取当前文件
  const getCurrentFile = useCallback(() => currentFileRef.current, []);

  const handleOpenProject = async (path: string) => {
    await saveTreeState();
    setProjectRoot(path);
    setOpenTabs([]);
    setActiveTabPath(null);
    try {
      await invoke("add_recent_project", { projectPath: path });
      await invoke("set_last_project", { projectPath: path });
    } catch (err) {
      console.error("记录最近项目失败:", err);
    }
  };

  // 关闭项目
  const handleCloseProject = async () => {
    // 检查是否有未保存的标签
    const dirtyTabs = openTabs.filter((t) => t.content !== t.savedContent);
    if (dirtyTabs.length > 0) {
      const confirmed = window.confirm(`有 ${dirtyTabs.length} 个文件未保存，确定关闭项目吗？`);
      if (!confirmed) return;
    }
    await saveTreeState();
    setProjectRoot(null);
    setOpenTabs([]);
    setActiveTabPath(null);
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
          setOpenTabs([]);
          setActiveTabPath(null);
          try {
            await invoke("add_recent_project", { projectPath: path });
            await invoke("set_last_project", { projectPath: path });
          } catch {}
        }
      } catch (err) {
        console.error("打开目录失败:", err);
      }
    } else if (action === "save") {
      handleSave();
    } else if (action === "set-theme-light") {
      handleThemeChange("light");
    } else if (action === "set-theme-dark") {
      handleThemeChange("dark");
    } else if (action === "open-settings") {
      setShowSettings(true);
    }
  }, [saveTreeState, handleThemeChange, handleSave]);

  // 计算当前文件的字数和类型（供 StatusBar 使用）
  const wordCount = activeTab ? countWords(activeTab.content) : 0;
  const fileType = getFileType(activeTabPath);

  return (
    <div className="app-root">
      <TitleBar onMenuAction={handleMenuAction} theme={theme} />
      {!projectRoot ? (
        <Welcome onOpenProject={handleOpenProject} />
      ) : (
        <div className="app-container">
          <aside className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
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
          <div className="resize-handle" onMouseDown={(e) => handleResizeStart("sidebar", e)} />
          <main className="editor-area">
            <TabBar
              tabs={openTabs.map((t) => ({ path: t.path, dirty: t.content !== t.savedContent }))}
              activeTabPath={activeTabPath}
              onTabClick={setActiveTabPath}
              onTabClose={handleCloseTab}
            />
            <Editor
              filePath={activeTabPath}
              content={fileContent}
              onChange={handleContentChange}
              theme={theme}
              mdMode={mdMode}
            />
            <StatusBar
              filePath={activeTabPath}
              wordCount={wordCount}
              fileType={fileType}
              mdMode={mdMode}
              onMdModeChange={setMdMode}
            />
          </main>
          <div className="resize-handle" onMouseDown={(e) => handleResizeStart("agent", e)} />
          <aside className="agent-panel" style={{ width: agentWidth, minWidth: agentWidth }}>
            <AgentPanel currentFile={currentFile} projectRoot={projectRoot} />
          </aside>
        </div>
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
