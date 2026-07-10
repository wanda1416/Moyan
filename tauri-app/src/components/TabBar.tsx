interface TabBarProps {
  tabs: { path: string; dirty: boolean; isSettings?: boolean }[];
  activeTabPath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
}

function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export default function TabBar({ tabs, activeTabPath, onTabClick, onTabClose }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar">
      {tabs.map((tab) => {
        const isActive = tab.path === activeTabPath;
        const label = tab.isSettings ? "设置" : getFileName(tab.path);
        return (
          <div
            key={tab.path}
            className={`tab-item${isActive ? " active" : ""}${tab.isSettings ? " tab-item-settings" : ""}`}
            onClick={() => onTabClick(tab.path)}
            title={tab.path}
          >
            <span className="tab-item-name">
              {tab.isSettings && <span className="tab-item-icon">⚙</span>}
              {label}
              {tab.dirty && <span className="tab-dirty">●</span>}
            </span>
            <button
              className="tab-item-close"
              title="关闭"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.path);
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
