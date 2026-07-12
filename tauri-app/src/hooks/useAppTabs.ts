import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 标签页数据 */
export interface TabData {
  path: string;
  content: string;
  savedContent: string;
  mdMode: "preview" | "source";
}

/** 特殊标签：设置页 */
export const SETTINGS_TAB_PATH = "__settings__";
/** 特殊标签：项目设置页 */
export const PROJECT_SETTINGS_TAB_PATH = "__project_settings__";

function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
}

/**
 * 管理多标签页状态和操作
 * - 标签打开/关闭/切换
 * - 文件内容读写
 * - 保存操作
 */
export function useAppTabs() {
  const [openTabs, setOpenTabs] = useState<TabData[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  // 派生状态
  const activeTab = openTabs.find((t) => t.path === activeTabPath) || null;
  const fileContent = activeTab?.content || "";
  const mdMode = activeTab?.mdMode || "preview";

  // 更新当前标签的 mdMode
  const setMdMode = useCallback(
    (mode: "preview" | "source") => {
      setOpenTabs((prev) =>
        prev.map((t) => (t.path === activeTabPath ? { ...t, mdMode: mode } : t))
      );
    },
    [activeTabPath]
  );

  // 选择文件（打开或切换标签）
  const handleFileSelect = useCallback(async (path: string) => {
    setOpenTabs((prev) => {
      const existing = prev.find((t) => t.path === path);
      if (existing) {
        setActiveTabPath(path);
        return prev;
      }
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
  const handleContentChange = useCallback(
    (value: string) => {
      setOpenTabs((prev) =>
        prev.map((t) => (t.path === activeTabPath ? { ...t, content: value } : t))
      );
    },
    [activeTabPath]
  );

  // 关闭标签（纯状态操作，不做脏检查）
  const closeTab = useCallback(
    (path: string) => {
      setOpenTabs((prev) => {
        const idx = prev.findIndex((t) => t.path === path);
        const newTabs = prev.filter((t) => t.path !== path);
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
    [activeTabPath]
  );

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

  // 保存指定路径的文件（用于关闭标签时保存）
  const saveTab = useCallback(async (path: string, content: string) => {
    if (isImageFile(path)) return;
    try {
      await invoke("write_file", { path, content });
      setOpenTabs((prev) =>
        prev.map((t) => (t.path === path ? { ...t, savedContent: t.content } : t))
      );
    } catch {}
  }, []);

  // 打开设置标签
  const openSettingsTab = useCallback(() => {
    setOpenTabs((prev) => {
      const exists = prev.some((t) => t.path === SETTINGS_TAB_PATH);
      if (exists) return prev;
      return [
        ...prev,
        { path: SETTINGS_TAB_PATH, content: "", savedContent: "", mdMode: "preview" },
      ];
    });
    setActiveTabPath(SETTINGS_TAB_PATH);
  }, []);

  // 打开项目设置标签
  const openProjectSettingsTab = useCallback(() => {
    setOpenTabs((prev) => {
      const exists = prev.some((t) => t.path === PROJECT_SETTINGS_TAB_PATH);
      if (exists) return prev;
      return [
        ...prev,
        { path: PROJECT_SETTINGS_TAB_PATH, content: "", savedContent: "", mdMode: "preview" },
      ];
    });
    setActiveTabPath(PROJECT_SETTINGS_TAB_PATH);
  }, []);

  // 批量恢复标签（FileTree 就绪时）
  const restoreTabs = useCallback(async (
    savedFile: string | null,
    openTabsInfo: { path: string; md_mode?: string }[],
  ) => {
    if (openTabsInfo.length === 0) {
      if (savedFile) {
        handleFileSelect(savedFile);
      }
      return;
    }

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

    const tabPaths = openTabsInfo.map((t) => t.path);
    const activePath = savedFile && tabPaths.includes(savedFile) ? savedFile : tabPaths[tabPaths.length - 1];
    setActiveTabPath(activePath);
  }, [handleFileSelect]);

  return {
    // 状态
    openTabs,
    setOpenTabs,
    activeTabPath,
    setActiveTabPath,
    activeTab,
    fileContent,
    mdMode,
    setMdMode,
    // 操作
    handleFileSelect,
    handleContentChange,
    closeTab,
    handleSave,
    saveTab,
    openSettingsTab,
    openProjectSettingsTab,
    restoreTabs,
  };
}
