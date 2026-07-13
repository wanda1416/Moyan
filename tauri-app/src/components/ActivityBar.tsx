export type SidebarView = "explorer" | "search";

interface ActivityBarProps {
  activeView: SidebarView;
  onViewChange: (view: SidebarView) => void;
}

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  return (
    <div className="activity-bar">
      <button
        className={`activity-icon${activeView === "explorer" ? " active" : ""}`}
        title="资源管理器"
        onClick={() => onViewChange("explorer")}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" />
        </svg>
      </button>
      <button
        className={`activity-icon${activeView === "search" ? " active" : ""}`}
        title="搜索文件"
        onClick={() => onViewChange("search")}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      </button>
    </div>
  );
}
