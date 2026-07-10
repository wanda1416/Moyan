interface TabBarProps {
  tabs: { path: string; dirty: boolean; isSettings?: boolean; isProjectSettings?: boolean }[];
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
        const label = tab.isSettings ? "设置" : tab.isProjectSettings ? "项目设置" : getFileName(tab.path);
        const isSpecialTab = tab.isSettings || tab.isProjectSettings;
        return (
          <div
            key={tab.path}
            className={`tab-item${isActive ? " active" : ""}${isSpecialTab ? " tab-item-settings" : ""}`}
            onClick={() => onTabClick(tab.path)}
            title={tab.path}
          >
            <span className="tab-item-name">
              {tab.isSettings && <span className="tab-item-icon">⚙</span>}
              {tab.isProjectSettings && <span className="tab-item-icon">📁</span>}
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
