import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import TitleBar from "./components/TitleBar";
import FileTree from "./components/FileTree";
import Editor, { getFileType, countWords } from "./components/Editor";
import AgentPanel from "./components/AgentPanel";
import Welcome from "./components/Welcome";
import Settings from "./components/Settings";
import ProjectSettings from "./components/ProjectSettings";
import TabBar from "./components/TabBar";
import StatusBar from "./components/StatusBar";
import ConfirmDialog from "./components/ConfirmDialog";
import ActivityBar, { type SidebarView } from "./components/ActivityBar";
import SearchPanel from "./components/SearchPanel";
import { useAppTabs, SETTINGS_TAB_PATH, PROJECT_SETTINGS_TAB_PATH } from "./hooks/useAppTabs";
import "./styles.css";

/** 后端 updater.rs 返回的更新信息结构 */
interface UpdateInfo {
  has_update: boolean;
  current_version: string;
  latest_version: string;
  release_url: string;
  release_notes: string;
  published_at: string;
}

type Theme = "light" | "dark";

interface IndexStatus {
  indexed: boolean;
  chunks: number;
  built_at: string;
}

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
  const [sidebarView, setSidebarView] = useState<SidebarView>("explorer");

  // 多标签状态（由 hook 管理）
  const {
    openTabs, setOpenTabs, activeTabPath, setActiveTabPath,
    activeTab, fileContent, mdMode, setMdMode,
    handleFileSelect, handleContentChange, handleSave, saveTab,
    openSettingsTab: openSettingsTabBase, openProjectSettingsTab, restoreTabs,
  } = useAppTabs();

  // 包装 openSettingsTab：同时设置 settingsTabRequest
  const openSettingsTab = useCallback((tab: "editor" | "llm" | "about" = "editor") => {
    openSettingsTabBase();
    setSettingsTabRequest(tab);
  }, [openSettingsTabBase]);

  // 编辑器设置
  const [editorFontFamily, setEditorFontFamily] = useState("");
  const [editorFontSize, setEditorFontSize] = useState(14);
  // 设置页脏状态（用 ref 同步追踪，避免关闭时拿到旧值）
  const [settingsDirty, setSettingsDirty] = useState(false);
  const settingsDirtyRef = useRef(false);

  // 通过菜单/气泡打开设置页时请求的目标 Tab（用作 key 强制重新挂载）
  const [settingsTabRequest, setSettingsTabRequest] = useState<"editor" | "llm" | "about">("editor");

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

  // 应用更新信息（启动 3 秒后异步检查）
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  // 本次会话是否已关闭过更新提示（用户手动关闭后不再弹）
  const updateDismissedRef = useRef(false);

  // RAG 索引状态
  const [indexStatus, setIndexStatus] = useState<{ indexed: boolean; chunks: number; built_at: string }>({
    indexed: false, chunks: 0, built_at: "",
  });
  const [buildIndexing, setBuildIndexing] = useState(false);

  const expandedPathsRef = useRef<Set<string>>(new Set());
  const resizingRef = useRef<"sidebar" | "agent" | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const currentFile = activeTabPath;

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
        .filter((t) => t.path !== SETTINGS_TAB_PATH && t.path !== PROJECT_SETTINGS_TAB_PATH)
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

  // 项目打开时自动构建索引（如果未建立）
  useEffect(() => {
    if (!projectRoot) return;
    // 先获取索引状态
    invoke<IndexStatus>("get_rag_index_status", { projectPath: projectRoot })
      .then((status) => {
        setIndexStatus(status);
        if (!status.indexed) {
          // 未建立索引，自动后台构建
          setBuildIndexing(true);
          invoke<{ status: string; chunks: number; duration: number }>(
            "build_rag_index", { projectPath: projectRoot }
          )
            .then((result) => {
              setIndexStatus({ indexed: true, chunks: result.chunks, built_at: new Date().toISOString() });
            })
            .catch((err) => {
              console.warn("自动构建索引失败:", err);
            })
            .finally(() => {
              setBuildIndexing(false);
            });
        }
      })
      .catch(() => {});
  }, [projectRoot]);

  // 启动 3 秒后异步检查更新（不阻塞 UI，失败静默）
  useEffect(() => {
    const timer = setTimeout(() => {
      invoke<UpdateInfo>("check_update")
        .then((info) => {
          if (info.has_update) {
            setUpdateInfo(info);
          }
        })
        .catch((err) => {
          console.warn("检查更新失败:", err);
        });
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // 关闭更新提示
  const handleDismissUpdate = useCallback(() => {
    updateDismissedRef.current = true;
    setUpdateInfo(null);
  }, []);

  // 打开更新链接（使用系统默认浏览器）
  const handleOpenUpdate = useCallback(async () => {
    if (!updateInfo) return;
    try {
      await openExternal(updateInfo.release_url);
    } catch (err) {
      console.error("打开更新链接失败:", err);
    }
  }, [updateInfo]);

  // 切换主题并保存
  const handleThemeChange = useCallback(async (newTheme: Theme) => {
    setTheme(newTheme);
    try {
      const settings = await invoke<Record<string, unknown>>("get_settings");
      settings.theme = newTheme;
      await invoke("save_settings", { settings: JSON.stringify(settings) });
    } catch {}
  }, []);

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
            await saveTab(path, openTabs.find((t) => t.path === path)?.content || "");
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

  // FileTree 加载完成后，恢复面板宽度 + 标签页
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
    // 恢复标签页
    await restoreTabs(savedFile, openTabsInfo);
  }, [restoreTabs]);

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
      openSettingsTab("editor");
    } else if (action === "open-about") {
      openSettingsTab("about");
    } else if (action === "open-project-settings") {
      openProjectSettingsTab();
    }
  }, [saveTreeState, handleThemeChange, handleSave, openSettingsTab, projectRoot]);

  // 计算当前文件的字数和类型（供 StatusBar 使用）
  const wordCount = activeTab ? countWords(activeTab.content) : 0;
  const fileType = getFileType(activeTabPath);
  const isSettingsActive = activeTabPath === SETTINGS_TAB_PATH;
  const isProjectSettingsActive = activeTabPath === PROJECT_SETTINGS_TAB_PATH;

  return (
    <div className="app-root">
      <TitleBar
        onMenuAction={handleMenuAction}
        theme={theme}
        updateInfo={updateInfo}
        onOpenUpdate={handleOpenUpdate}
        onDismissUpdate={handleDismissUpdate}
      />
      {!projectRoot ? (
        <Welcome onOpenProject={handleOpenProject} />
      ) : (
        <div className="app-container">
          <ActivityBar activeView={sidebarView} onViewChange={setSidebarView} />
          <aside className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
            {sidebarView === "explorer" ? (
              <>
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
              </>
            ) : (
              <SearchPanel projectRoot={projectRoot} onFileSelect={handleFileSelect} />
            )}
          </aside>
          <div className="resize-handle" onMouseDown={(e) => handleResizeStart("sidebar", e)} />
          <main className="editor-area">
            <TabBar
              tabs={openTabs.map((t) => ({
                path: t.path,
                dirty: t.path === SETTINGS_TAB_PATH ? settingsDirty : t.content !== t.savedContent,
                isSettings: t.path === SETTINGS_TAB_PATH,
                isProjectSettings: t.path === PROJECT_SETTINGS_TAB_PATH,
              }))}
              activeTabPath={activeTabPath}
              onTabClick={setActiveTabPath}
              onTabClose={handleCloseTab}
            />
            {isSettingsActive ? (
              <Settings
                key={`settings-${settingsTabRequest}-${openTabs.find((t) => t.path === SETTINGS_TAB_PATH)?.path ?? "x"}`}
                initialTab={settingsTabRequest}
                appliedSettings={{ fontFamily: editorFontFamily, fontSize: editorFontSize }}
                onApplyEditor={handleApplyEditorSettings}
                onDirtyChange={(dirty) => {
                  settingsDirtyRef.current = dirty;
                  setSettingsDirty(dirty);
                }}
                registerApply={(fn) => { settingsApplyRef.current = fn; }}
              />
            ) : isProjectSettingsActive && projectRoot ? (
              <ProjectSettings projectRoot={projectRoot} />
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
            {!isSettingsActive && !isProjectSettingsActive && (
              <StatusBar
                filePath={activeTabPath}
                wordCount={wordCount}
                fileType={fileType}
                mdMode={mdMode}
                onMdModeChange={setMdMode}
                indexStatus={indexStatus}
                buildIndexing={buildIndexing}
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
