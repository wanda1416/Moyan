import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SearchResult } from "../types";

interface SearchPanelProps {
  projectRoot: string;
  onFileSelect: (path: string) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export default function SearchPanel({ projectRoot, onFileSelect }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const myReqId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await invoke<SearchResult[]>("search_files", {
          root: projectRoot,
          query: trimmed,
        });
        // 防止过期请求覆盖最新结果
        if (myReqId === requestIdRef.current) {
          setResults(data);
          setSearching(false);
        }
      } catch (err) {
        console.error("搜索失败:", err);
        if (myReqId === requestIdRef.current) {
          setResults([]);
          setSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, projectRoot]);

  // 计算相对于项目根的路径
  const getRelativePath = (parentPath: string): string => {
    if (!parentPath) return "";
    const norm = parentPath.replace(/\\/g, "/");
    const root = projectRoot.replace(/\\/g, "/");
    if (norm === root) return "/";
    if (norm.startsWith(root + "/")) {
      return norm.slice(root.length);
    }
    return norm;
  };

  return (
    <div className="search-panel">
      <div className="search-input-wrap">
        <input
          className="search-input"
          placeholder="搜索文件..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="search-results">
        {!query.trim() ? (
          <div className="search-empty">输入文件名进行搜索</div>
        ) : searching ? (
          <div className="search-empty">搜索中...</div>
        ) : results.length === 0 ? (
          <div className="search-empty">未找到匹配的文件</div>
        ) : (
          results.map((r) => (
            <div
              key={r.path}
              className="search-result-item"
              onClick={() => onFileSelect(r.path)}
            >
              <span className="search-result-icon">{r.is_dir ? "📁" : "📄"}</span>
              <span className="search-result-name">{r.name}</span>
              <span className="search-result-path">{getRelativePath(r.parent_path)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
