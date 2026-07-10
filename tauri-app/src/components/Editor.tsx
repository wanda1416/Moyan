import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as monaco from "monaco-editor";

interface EditorProps {
  filePath: string | null;
  content: string;
  onChange: (value: string) => void;
  theme?: "light" | "dark";
}

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

function getLanguage(fileType: FileType, path: string): string {
  if (fileType === "markdown") return "markdown";
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    xml: "xml", html: "html", css: "css",
    js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
    py: "python", rs: "rust", go: "go", java: "java",
    c: "c", cpp: "cpp", h: "c",
    sh: "shell", bat: "bat", ps1: "powershell",
    sql: "sql", log: "log",
  };
  return langMap[ext] || "plaintext";
}

function countWords(text: string): number {
  // 中文字符数 + 英文单词数
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const english = text.replace(/[\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0).length;
  return chinese + english;
}

export default function Editor({ filePath, content, onChange, theme = "light" }: EditorProps) {
  const [mdMode, setMdMode] = useState<"preview" | "source">("preview");
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const fileType = getFileType(filePath);

  // 字数统计
  useEffect(() => {
    setWordCount(countWords(content));
  }, [content]);

  // 初始化 Monaco Editor
  useEffect(() => {
    if (fileType !== "text" && fileType !== "markdown") return;
    if (mdMode === "preview") return;
    if (!editorContainerRef.current) return;

    // 清理旧实例
    if (editorRef.current) {
      editorRef.current.dispose();
      editorRef.current = null;
    }

    const editor = monaco.editor.create(editorContainerRef.current, {
      value: content,
      language: getLanguage(fileType, filePath || ""),
      theme: theme === "dark" ? "vs-dark" : "vs",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: "on",
      wordWrap: "on",
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      tabSize: 2,
      padding: { top: 8 },
    });

    editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      onChangeRef.current(value);
    });

    editorRef.current = editor;

    return () => {
      editor.dispose();
      editorRef.current = null;
    };
  }, [filePath, fileType, mdMode, theme]);

  // 更新内容（外部变化时同步到 Monaco）
  useEffect(() => {
    if (editorRef.current) {
      const currentValue = editorRef.current.getValue();
      if (currentValue !== content) {
        const position = editorRef.current.getPosition();
        editorRef.current.setValue(content);
        if (position) {
          editorRef.current.setPosition(position);
        }
      }
    }
  }, [content]);

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
          <span className="tab-info">{wordCount.toLocaleString()} 字</span>
        </div>
        {mdMode === "preview" ? (
          <div className="markdown-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <div ref={editorContainerRef} className="monaco-container" />
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
          <span className="tab-info">{wordCount.toLocaleString()} 字</span>
        </div>
        <div ref={editorContainerRef} className="monaco-container" />
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
