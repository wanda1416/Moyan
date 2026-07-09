import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface EditorProps {
  filePath: string | null;
  content: string;
  onChange: (value: string) => void;
}

// 根据文件扩展名判断类型
type FileType = "text" | "markdown" | "image" | "unknown";

function getFileType(path: string | null): FileType {
  if (!path) return "unknown";
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (["md", "markdown"].includes(ext)) return "markdown";
  if (["txt", "json", "yaml", "yml", "toml", "xml", "html", "css", "js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "sh", "bat", "ps1", "sql", "log", "env", "ini", "cfg", "conf"].includes(ext)) return "text";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
  return "unknown";
}

function getMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    bmp: "image/bmp", ico: "image/x-icon",
  };
  return map[ext] || "application/octet-stream";
}

function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export default function Editor({ filePath, content, onChange }: EditorProps) {
  const [mdMode, setMdMode] = useState<"preview" | "source">("preview");
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileType = getFileType(filePath);

  // 加载图片文件
  useEffect(() => {
    if (fileType !== "image" || !filePath) {
      setImageData(null);
      return;
    }

    setLoading(true);
    setError(null);
    invoke<string>("read_file_base64", { path: filePath })
      .then((base64) => {
        const mime = getMimeType(filePath);
        setImageData(`data:${mime};base64,${base64}`);
      })
      .catch((err) => {
        setError(`加载图片失败: ${err}`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [filePath, fileType]);

  // 重置 markdown 模式为预览
  useEffect(() => {
    if (fileType === "markdown") {
      setMdMode("preview");
    }
  }, [filePath, fileType]);

  // 空状态
  if (!filePath) {
    return (
      <div className="editor-placeholder">
        <p>请从左侧目录树选择一个文件打开</p>
      </div>
    );
  }

  // 加载中
  if (loading) {
    return (
      <div className="editor-wrapper">
        <div className="editor-tab">
          <span className="tab-filename">{getFileName(filePath)}</span>
        </div>
        <div className="editor-loading">加载中...</div>
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div className="editor-wrapper">
        <div className="editor-tab">
          <span className="tab-filename">{getFileName(filePath)}</span>
        </div>
        <div className="editor-error">{error}</div>
      </div>
    );
  }

  // 图片预览
  if (fileType === "image" && imageData) {
    return (
      <div className="editor-wrapper">
        <div className="editor-tab">
          <span className="tab-filename">{getFileName(filePath)}</span>
          <span className="tab-info">图片预览</span>
        </div>
        <div className="image-preview-container">
          <img src={imageData} alt={getFileName(filePath)} className="image-preview" />
        </div>
      </div>
    );
  }

  // Markdown 文件
  if (fileType === "markdown") {
    return (
      <div className="editor-wrapper">
        <div className="editor-tab">
          <span className="tab-filename">{getFileName(filePath)}</span>
          <div className="tab-actions">
            <button
              className={`tab-btn ${mdMode === "preview" ? "active" : ""}`}
              onClick={() => setMdMode("preview")}
            >
              预览
            </button>
            <button
              className={`tab-btn ${mdMode === "source" ? "active" : ""}`}
              onClick={() => setMdMode("source")}
            >
              源码
            </button>
          </div>
        </div>
        {mdMode === "preview" ? (
          <div className="markdown-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            className="editor-textarea"
            value={content}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
          />
        )}
      </div>
    );
  }

  // 普通文本文件
  if (fileType === "text") {
    return (
      <div className="editor-wrapper">
        <div className="editor-tab">
          <span className="tab-filename">{getFileName(filePath)}</span>
          <span className="tab-info">文本</span>
        </div>
        <textarea
          className="editor-textarea"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    );
  }

  // 未知文件类型
  return (
    <div className="editor-wrapper">
      <div className="editor-tab">
        <span className="tab-filename">{getFileName(filePath)}</span>
      </div>
      <div className="editor-placeholder">
        <p>不支持预览此文件类型</p>
        <p className="hint">{filePath}</p>
      </div>
    </div>
  );
}
