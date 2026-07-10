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
import ConfirmDialog from "./components/ConfirmDialog";
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

/** 特殊标签：设置页 */
const SETTINGS_TAB_PATH = "__settings__";

// 面板宽度默认值
const DEFAULT_SIDEBAR_WIDTH = 260;
const DEFAULT_AGENT_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 150;
const MIN_AGENT_WIDTH = 200;

function App() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [agentWidth, setAgentWidth] = useState(DEFAULT_AGENT_WIDTH);

  // 多标签状态
  const [openTabs, setOpenTabs] = useState<TabData[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  // 编辑器设置
  const [editorFontFamily, setEditorFontFamily] = useState("");
  const [editorFontSize, setEditorFontSize] = useState(14);
  // 设置页脏状态（用 ref 同步追踪，避免关闭时拿到旧值）
  const [settingsDirty, setSettingsDirty] = useState(false);
  const settingsDirtyRef = useRef(false);

  // 自定义确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onDestructive?: () => void;
    onSave?: () => void;
  }>({ open: false, title: "", message: "" });

  // 关闭时正在处理的路径（用于回调）
  const pendingCloseRef = useRef<{ path: string; onAfter: () => void } | null>(null);

  // Settings 组件注册的应用函数（由 Settings 在挂载时设置）
  const settingsApplyRef = useRef<(() => Promise<boolean>) | null>(null);

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

  // 保存项目状态（目录树展开 + 当前文件 + 打开的标签页 + 面板宽度）
  const saveTreeState = useCallback(async () => {
    if (!projectRoot) return;
    try {
      const paths = Array.from(expandedPathsRef.current);
      const tabsInfo = openTabs
        .filter((t) => t.path !== SETTINGS_TAB_PATH)
        .map((t) => ({ path: t.path, md_mode: t.mdMode }));
      await invoke("save_tree_state", {
        projectPath: projectRoot,
        expandedPaths: paths,
        currentFile: currentFileRef.current,
        openTabs: tabsInfo,
        panelWidths: {
          sidebar_width: sidebarWidth,
          agent_width: agentWidth,
        },
      });
    } catch {}
  }, [projectRoot, openTabs, sidebarWidth, agentWidth]);

  // 加载主题配置和上次打开的项目
  useEffect(() => {
    invoke("init_app_dir").catch(console.error);
    
    // 加载主题
    invoke<Record<string, unknown>>("get_settings").then((settings) => {
      const saved = settings?.theme as Theme | undefined;
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
      }
      // 加载编辑器设置
      const editor = settings?.editor as Record<string, unknown> | undefined;
      if (editor) {
        if (typeof editor.fontFamily === "string") setEditorFontFamily(editor.fontFamily);
        if (typeof editor.fontSize === "number") setEditorFontSize(editor.fontSize);
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
    // 设置标签特殊处理
    if (path === SETTINGS_TAB_PATH) {
      if (settingsDirtyRef.current) {
        // 使用自定义对话框（window.confirm 在 Tauri 中不可靠）
        pendingCloseRef.current = {
          path,
          onAfter: () => {
            setOpenTabs((prev) => {
              const newTabs = prev.filter((t) => t.path !== path);
              if (path === activeTabPath) {
                setActiveTabPath(newTabs.length > 0 ? newTabs[0].path : null);
              }
              return newTabs;
            });
            settingsDirtyRef.current = false;
            setSettingsDirty(false);
          },
        };
        setConfirmDialog({
          open: true,
          title: "设置未保存",
          message: `当前设置有未保存的修改，请选择如何处理：\n\n• 保存：应用修改后关闭\n• 放弃修改：丢弃修改后关闭\n• 取消：返回设置页`,
          onSave: async () => {
            // 调用 Settings 组件注册的应用函数
            if (settingsApplyRef.current) {
              const ok = await settingsApplyRef.current();
              if (ok) {
                setConfirmDialog((d) => ({ ...d, open: false }));
                pendingCloseRef.current?.onAfter();
              }
              // 应用失败时保持对话框打开，让用户选择其他操作
            }
          },
          onDestructive: () => {
            setConfirmDialog((d) => ({ ...d, open: false }));
            pendingCloseRef.current?.onAfter();
          },
        });
        return;
      }
      // 没有脏状态，直接关闭
      setOpenTabs((prev) => {
        const newTabs = prev.filter((t) => t.path !== path);
        if (path === activeTabPath) {
          setActiveTabPath(newTabs.length > 0 ? newTabs[0].path : null);
        }
        return newTabs;
      });
      settingsDirtyRef.current = false;
      setSettingsDirty(false);
      return;
    }

    // 普通文件标签
    setOpenTabs((prev) => {
      const tab = prev.find((t) => t.path === path);
      if (tab && tab.content !== tab.savedContent) {
        const name = path.split(/[\\/]/).pop();
        pendingCloseRef.current = {
          path,
          onAfter: () => {
            setOpenTabs((prev2) => {
              const idx = prev2.findIndex((t) => t.path === path);
              const newTabs = prev2.filter((t) => t.path !== path);
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
          },
        };
        setConfirmDialog({
          open: true,
          title: "文件未保存",
          message: `"${name}" 有未保存的修改，请选择如何处理：\n\n• 保存：保存文件后关闭\n• 放弃修改：丢弃修改后关闭\n• 取消：返回编辑器`,
          onSave: async () => {
            // 调用 handleSave 的逻辑
            if (path === activeTabPath) {
              const tab = openTabs.find((t) => t.path === path);
              if (tab && !isImageFile(path)) {
                try {
                  await invoke("write_file", { path, content: tab.content });
                  setOpenTabs((prev2) =>
                    prev2.map((t) => (t.path === path ? { ...t, savedContent: t.content } : t))
                  );
                } catch {}
              }
            }
            setConfirmDialog((d) => ({ ...d, open: false }));
            pendingCloseRef.current?.onAfter();
          },
          onDestructive: () => {
            setConfirmDialog((d) => ({ ...d, open: false }));
            pendingCloseRef.current?.onAfter();
          },
        });
        return prev;
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
  }, [activeTabPath, openTabs]);

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

  // FileTree 加载完成后，恢复上次打开的所有标签页 + 面板宽度
  const handleFileTreeReady = useCallback(async (
    savedFile: string | null,
    openTabsInfo: { path: string; md_mode?: string }[],
    panelWidths?: { sidebar_width?: number | null; agent_width?: number | null }
  ) => {
    // 恢复面板宽度
    if (panelWidths) {
      if (typeof panelWidths.sidebar_width === "number" && panelWidths.sidebar_width >= MIN_SIDEBAR_WIDTH) {
        setSidebarWidth(panelWidths.sidebar_width);
      }
      if (typeof panelWidths.agent_width === "number" && panelWidths.agent_width >= MIN_AGENT_WIDTH) {
        setAgentWidth(panelWidths.agent_width);
      }
    }

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

  // 应用编辑器设置（由设置页点击"应用"时调用）
  const handleApplyEditorSettings = useCallback(async (newSettings: { fontFamily: string; fontSize: number }): Promise<boolean> => {
    try {
      const settings = await invoke<Record<string, unknown>>("get_settings");
      settings.editor = newSettings;
      await invoke("save_settings", { settings: JSON.stringify(settings) });
      // 立即更新本地 state，让 Monaco 通过 updateOptions 生效
      setEditorFontFamily(newSettings.fontFamily);
      setEditorFontSize(newSettings.fontSize);
      return true;
    } catch {
      return false;
    }
  }, []);

  // 供 FileTree 防抖保存时获取当前文件
  const getCurrentFile = useCallback(() => currentFileRef.current, []);

  // 供 FileTree 防抖保存时获取当前面板宽度
  const getPanelWidths = useCallback(() => ({
    sidebar_width: sidebarWidth,
    agent_width: agentWidth,
  }), [sidebarWidth, agentWidth]);

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

  // 打开设置标签（如果已存在则切换；不存在则添加）
  const openSettingsTab = useCallback(() => {
    setOpenTabs((prev) => {
      const exists = prev.some((t) => t.path === SETTINGS_TAB_PATH);
      if (exists) return prev;
      return [
        ...prev,
        {
          path: SETTINGS_TAB_PATH,
          content: "",
          savedContent: "",
          mdMode: "preview",
        },
      ];
    });
    setActiveTabPath(SETTINGS_TAB_PATH);
  }, []);

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
      openSettingsTab();
    }
  }, [saveTreeState, handleThemeChange, handleSave, openSettingsTab]);

  // 计算当前文件的字数和类型（供 StatusBar 使用）
  const wordCount = activeTab ? countWords(activeTab.content) : 0;
  const fileType = getFileType(activeTabPath);
  const isSettingsActive = activeTabPath === SETTINGS_TAB_PATH;

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
              getPanelWidths={getPanelWidths}
            />
          </aside>
          <div className="resize-handle" onMouseDown={(e) => handleResizeStart("sidebar", e)} />
          <main className="editor-area">
            <TabBar
              tabs={openTabs.map((t) => ({
                path: t.path,
                dirty: t.path === SETTINGS_TAB_PATH ? settingsDirty : t.content !== t.savedContent,
                isSettings: t.path === SETTINGS_TAB_PATH,
              }))}
              activeTabPath={activeTabPath}
              onTabClick={setActiveTabPath}
              onTabClose={handleCloseTab}
            />
            {isSettingsActive ? (
              <Settings
                appliedSettings={{ fontFamily: editorFontFamily, fontSize: editorFontSize }}
                onApplyEditor={handleApplyEditorSettings}
                onDirtyChange={(dirty) => {
                  settingsDirtyRef.current = dirty;
                  setSettingsDirty(dirty);
                }}
                registerApply={(fn) => { settingsApplyRef.current = fn; }}
              />
            ) : (
              <Editor
                filePath={activeTabPath}
                content={fileContent}
                onChange={handleContentChange}
                theme={theme}
                mdMode={mdMode}
                fontFamily={editorFontFamily}
                fontSize={editorFontSize}
              />
            )}
            {!isSettingsActive && (
              <StatusBar
                filePath={activeTabPath}
                wordCount={wordCount}
                fileType={fileType}
                mdMode={mdMode}
                onMdModeChange={setMdMode}
              />
            )}
          </main>
          <div className="resize-handle" onMouseDown={(e) => handleResizeStart("agent", e)} />
          <aside className="agent-panel" style={{ width: agentWidth, minWidth: agentWidth }}>
            <AgentPanel currentFile={currentFile} projectRoot={projectRoot} />
          </aside>
        </div>
      )}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onCancel={() => setConfirmDialog((d) => ({ ...d, open: false }))}
        onConfirm={confirmDialog.onSave}
        onDestructive={confirmDialog.onDestructive}
        cancelText="取消"
        confirmText="保存"
        destructiveText="放弃修改"
      />
    </div>
  );
}

export default App;
