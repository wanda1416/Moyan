interface StatusBarProps {
  filePath: string | null;
  wordCount: number;
  fileType: string;
  mdMode?: "preview" | "source";
  onMdModeChange?: (mode: "preview" | "source") => void;
}

export default function StatusBar({
  filePath,
  wordCount,
  fileType,
  mdMode,
  onMdModeChange,
}: StatusBarProps) {
  if (!filePath) return null;

  return (
    <div className="status-bar">
      <div className="status-bar-left" />
      <div className="status-bar-right">
        {fileType === "markdown" && mdMode && onMdModeChange && (
          <div className="status-bar-group">
            <button
              className={`status-btn${mdMode === "preview" ? " active" : ""}`}
              onClick={() => onMdModeChange("preview")}
            >
              预览
            </button>
            <button
              className={`status-btn${mdMode === "source" ? " active" : ""}`}
              onClick={() => onMdModeChange("source")}
            >
              源码
            </button>
          </div>
        )}
        {(fileType === "text" || fileType === "markdown") && (
          <span className="status-bar-info">{wordCount.toLocaleString()} 字</span>
        )}
        {fileType === "image" && (
          <span className="status-bar-info">图片预览</span>
        )}
      </div>
    </div>
  );
}
