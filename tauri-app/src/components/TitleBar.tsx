import { useState, useRef, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface TitleBarProps {
  onMenuAction: (action: string) => void;
  theme: "light" | "dark";
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

export default function TitleBar({ onMenuAction, theme }: TitleBarProps) {
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
      if (target.closest('.win-btn') || target.closest('.menu-item')) return;
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

  const menus: MenuDef[] = [
    {
      label: "文件",
      items: [
        { label: "打开项目...", action: "open-project" },
        { label: "保存", shortcut: "Ctrl+S", action: "save" },
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
        { label: "关于墨言", disabled: true },
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
        <div className="titlebar-title" />
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
