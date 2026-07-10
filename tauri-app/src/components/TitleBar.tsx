import { useState, useRef, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 更新提示信息（与后端 updater.rs UpdateInfo 对应） */
export interface TitleBarUpdateInfo {
  latest_version: string;
  release_url: string;
}

interface TitleBarProps {
  onMenuAction: (action: string) => void;
  theme: "light" | "dark";
  /** 有可用更新时显示气泡（null = 无更新） */
  updateInfo?: TitleBarUpdateInfo | null;
  /** 点击气泡的下载按钮时触发 */
  onOpenUpdate?: (url: string) => void;
  /** 关闭更新气泡 */
  onDismissUpdate?: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: string;
  separator?: boolean;
  disabled?: boolean;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

export default function TitleBar({
  onMenuAction,
  theme,
  updateInfo,
  onOpenUpdate,
  onDismissUpdate,
}: TitleBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const titlebarRef = useRef<HTMLDivElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const appWindow = getCurrentWindow();

  // 监听最大化状态
  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized).catch(() => {});
    let unlisten: (() => void) | undefined;
    appWindow.onResized(async () => {
      const max = await appWindow.isMaximized().catch(() => false);
      setIsMaximized(max);
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [appWindow]);

  // 原生 mousedown 监听：即时拖拽
  useEffect(() => {
    const el = titlebarRef.current;
    if (!el) return;

    const onMouseDown = (e: globalThis.MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('.win-btn') || target.closest('.menu-item') || target.closest('.update-bubble')) return;
      appWindow.startDragging().catch((err: unknown) => console.error('startDragging failed:', err));
    };

    el.addEventListener('mousedown', onMouseDown);
    return () => { el.removeEventListener('mousedown', onMouseDown); };
  }, [appWindow]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleMinimize = useCallback(() => {
    appWindow.minimize().catch((err: unknown) => console.error("minimize failed:", err));
  }, [appWindow]);

  const handleToggleMaximize = useCallback(() => {
    appWindow.toggleMaximize().catch((err: unknown) => console.error("toggleMaximize failed:", err));
  }, [appWindow]);

  const handleClose = useCallback(() => {
    appWindow.close().catch((err: unknown) => console.error("close failed:", err));
  }, [appWindow]);

  const handleUpdateClick = useCallback(() => {
    if (!updateInfo) return;
    if (onOpenUpdate) {
      onOpenUpdate(updateInfo.release_url);
    } else if (typeof window !== "undefined") {
      // 兜底：直接 window.open（Dev 模式可能 onOpenUpdate 未注册）
      window.open(updateInfo.release_url, "_blank", "noopener");
    }
  }, [updateInfo, onOpenUpdate]);

  const handleUpdateDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDismissUpdate) onDismissUpdate();
  }, [onDismissUpdate]);

  const menus: MenuDef[] = [
    {
      label: "文件",
      items: [
        { label: "打开项目...", action: "open-project" },
        { label: "保存", shortcut: "Ctrl+S", action: "save" },
        { label: "", separator: true },
        { label: "项目设置...", action: "open-project-settings" },
        { label: "", separator: true },
        { label: "退出", action: "exit" },
      ],
    },
    {
      label: "编辑",
      items: [
        { label: "撤销", shortcut: "Ctrl+Z", disabled: true },
        { label: "重做", shortcut: "Ctrl+Y", disabled: true },
        { label: "", separator: true },
        { label: "剪切", shortcut: "Ctrl+X", disabled: true },
        { label: "复制", shortcut: "Ctrl+C", disabled: true },
        { label: "粘贴", shortcut: "Ctrl+V", disabled: true },
      ],
    },
    {
      label: "视图",
      items: [
        { label: theme === "light" ? "✓ 浅色主题" : "  浅色主题", action: "set-theme-light" },
        { label: theme === "dark" ? "✓ 深色主题" : "  深色主题", action: "set-theme-dark" },
        { label: "", separator: true },
        { label: "设置...", action: "open-settings" },
      ],
    },
    {
      label: "帮助",
      items: [
        { label: "关于墨言", action: "open-about" },
      ],
    },
  ];

  const handleMenuClick = (index: number) => {
    setOpenMenu(openMenu === index ? null : index);
  };

  const handleMenuEnter = (index: number) => {
    if (openMenu !== null) setOpenMenu(index);
  };

  const handleItemAction = (item: MenuItem) => {
    if (item.disabled || item.separator) return;
    setOpenMenu(null);
    if (item.action === "exit") {
      appWindow.close().catch(console.error);
    } else if (item.action) {
      onMenuAction(item.action);
    }
  };

  return (
    <div className="titlebar" ref={titlebarRef}>
      <div className="titlebar-content">
        <div className="titlebar-menus" ref={menuContainerRef}>
          {menus.map((menu, i) => (
            <div
              key={menu.label}
              className={`menu-item ${openMenu === i ? "open" : ""}`}
              onClick={() => handleMenuClick(i)}
              onMouseEnter={() => handleMenuEnter(i)}
            >
              <span className="menu-label">{menu.label}</span>
              {openMenu === i && (
                <div className="menu-dropdown">
                  {menu.items.map((item, j) =>
                    item.separator ? (
                      <div key={j} className="menu-separator" />
                    ) : (
                      <div
                        key={j}
                        className={`menu-action ${item.disabled ? "disabled" : ""}`}
                        onClick={() => handleItemAction(item)}
                      >
                        <span className="action-label">{item.label}</span>
                        {item.shortcut && (
                          <span className="action-shortcut">{item.shortcut}</span>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="titlebar-title">
          <img src="/logo.png" alt="墨言" className="titlebar-logo" />
          <span className="titlebar-app-name">墨言</span>
        </div>
      </div>
      <div className="titlebar-update-area">
        {updateInfo && (
          <div className="update-bubble" role="status">
            <button
              className="update-bubble-action"
              onClick={handleUpdateClick}
              title={`查看 v${updateInfo.latest_version} 发布说明`}
            >
              <span className="update-bubble-dot" aria-hidden="true" />
              <span className="update-bubble-text">发现新版本 v{updateInfo.latest_version}</span>
            </button>
            <button
              className="update-bubble-close"
              onClick={handleUpdateDismiss}
              title="关闭"
              aria-label="关闭更新提示"
            >
              ×
            </button>
          </div>
        )}
      </div>
      <div className="titlebar-controls">
        <button className="win-btn" onClick={handleMinimize} title="最小化">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button className="win-btn" onClick={handleToggleMaximize} title={isMaximized ? "还原" : "最大化"}>
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="2" y="0" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="0" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button className="win-btn win-close" onClick={handleClose} title="关闭">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
