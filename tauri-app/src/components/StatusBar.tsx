interface StatusBarProps {
  filePath: string | null;
  wordCount: number;
  fileType: string;
  mdMode?: "preview" | "source";
  onMdModeChange?: (mode: "preview" | "source") => void;
  indexStatus?: { indexed: boolean; chunks: number; built_at: string };
  buildIndexing?: boolean;
}

export default function StatusBar({
  filePath,
  wordCount,
  fileType,
  mdMode,
  onMdModeChange,
  indexStatus,
  buildIndexing,
}: StatusBarProps) {
  if (!filePath) return null;

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {indexStatus && (
          <span
            className="status-bar-index"
            title={
              buildIndexing
                ? "正在构建 RAG 索引..."
                : indexStatus.indexed
                  ? `RAG 索引已建立（${indexStatus.chunks} 个片段）`
                  : "未建立 RAG 索引"
            }
          >
            <span
              className={`index-dot ${buildIndexing ? "building" : indexStatus.indexed ? "indexed" : ""}`}
            />
            {buildIndexing && <span className="index-label">索引中...</span>}
          </span>
        )}
      </div>
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
