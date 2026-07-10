import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ProjectSettingsProps {
  projectRoot: string;
}

interface IndexStatus {
  indexed: boolean;
  chunks: number;
  built_at: string;
}

interface SearchResult {
  text: string;
  source_path: string;
  heading: string;
  score: number;
}

export default function ProjectSettings({ projectRoot }: ProjectSettingsProps) {
  const [activeTab, setActiveTab] = useState<"rag">("rag");

  // RAG 索引状态
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ indexed: false, chunks: 0, built_at: "" });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [building, setBuilding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [indexMessage, setIndexMessage] = useState("");

  // RAG 检索
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // 加载索引状态
  const loadIndexStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const status = await invoke<IndexStatus>("get_rag_index_status", { projectPath: projectRoot });
      setIndexStatus(status);
    } catch {
      setIndexStatus({ indexed: false, chunks: 0, built_at: "" });
    } finally {
      setLoadingStatus(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    loadIndexStatus();
  }, [loadIndexStatus]);

  // 重建索引（全量）
  const handleBuildIndex = useCallback(async () => {
    setBuilding(true);
    setIndexMessage("");
    try {
      const result = await invoke<{ status: string; chunks: number; duration: number }>(
        "build_rag_index", { projectPath: projectRoot }
      );
      setIndexStatus({ indexed: true, chunks: result.chunks, built_at: new Date().toISOString() });
      setIndexMessage(`✓ 索引重建完成：${result.chunks.toLocaleString()} 个片段，耗时 ${result.duration.toFixed(1)}s`);
    } catch (err) {
      setIndexMessage(`✗ 重建失败: ${err}`);
    } finally {
      setBuilding(false);
    }
  }, [projectRoot]);

  // 刷新索引（增量）
  const handleRefreshIndex = useCallback(async () => {
    setBuilding(true);
    setIndexMessage("");
    try {
      const result = await invoke<{
        status: string; chunks: number; duration: number;
        incremental: boolean; added_files: number; modified_files: number;
        deleted_files: number; unchanged_files: number;
      }>("refresh_rag_index", { projectPath: projectRoot });
      setIndexStatus({ indexed: true, chunks: result.chunks, built_at: new Date().toISOString() });
      if (result.incremental) {
        const parts: string[] = [];
        if (result.added_files > 0) parts.push(`新增 ${result.added_files} 个文件`);
        if (result.modified_files > 0) parts.push(`修改 ${result.modified_files} 个`);
        if (result.deleted_files > 0) parts.push(`删除 ${result.deleted_files} 个`);
        const changeInfo = parts.length > 0 ? parts.join("，") : "无文件变更";
        setIndexMessage(`✓ 索引刷新完成：${changeInfo}，共 ${result.chunks.toLocaleString()} 个片段，耗时 ${result.duration.toFixed(1)}s`);
      } else {
        setIndexMessage(`✓ 索引刷新完成（全量重建）：${result.chunks.toLocaleString()} 个片段，耗时 ${result.duration.toFixed(1)}s`);
      }
    } catch (err) {
      setIndexMessage(`✗ 刷新失败: ${err}`);
    } finally {
      setBuilding(false);
    }
  }, [projectRoot]);

  // 删除索引
  const handleDeleteIndex = useCallback(async () => {
    if (!window.confirm("确定要删除当前项目的 RAG 索引吗？删除后需要重新构建才能使用检索功能。")) return;
    setDeleting(true);
    setIndexMessage("");
    try {
      await invoke("delete_rag_index", { projectPath: projectRoot });
      setIndexStatus({ indexed: false, chunks: 0, built_at: "" });
      setResults([]);
      setIndexMessage("✓ 索引已删除");
    } catch (err) {
      setIndexMessage(`✗ 删除失败: ${err}`);
    } finally {
      setDeleting(false);
    }
  }, [projectRoot]);

  // 执行检索
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError("");
    setResults([]);
    setExpandedIdx(null);
    try {
      const resp = await invoke<{ status: string; results: SearchResult[] }>("search_rag", {
        projectPath: projectRoot,
        query: query.trim(),
        topK: 10,
      });
      if (resp.status === "error") {
        setSearchError("检索失败，请确认索引已构建");
      } else {
        setResults(resp.results || []);
      }
    } catch (err) {
      setSearchError(`检索失败: ${err}`);
    } finally {
      setSearching(false);
    }
  }, [projectRoot, query]);

  // Enter 键提交
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // 格式化分数
  const formatScore = (score: number) => `${(score * 100).toFixed(1)}%`;

  // 获取文件名
  const getFileName = (path: string) => path.split(/[\\/]/).pop() || path;

  // 截断文本
  const truncate = (text: string, maxLen: number) =>
    text.length > maxLen ? text.slice(0, maxLen) + "..." : text;

  return (
    <div className="settings-panel">
      {/* Tab 导航 */}
      <div className="settings-tabs">
        <button
          className={`settings-tab${activeTab === "rag" ? " active" : ""}`}
          onClick={() => setActiveTab("rag")}
        >
          RAG 检索
        </button>
      </div>

      {/* RAG 检索 Tab */}
      {activeTab === "rag" && (
        <div className="settings-body">
          {/* 索引状态 */}
          <div className="settings-section">
            <h3>索引状态</h3>
            {loadingStatus ? (
              <p className="rag-index-status">加载中...</p>
            ) : indexStatus.indexed ? (
              <div className="rag-index-status">
                <span className="rag-status-dot indexed" />
                <span>已建立索引：{indexStatus.chunks.toLocaleString()} 个片段</span>
                {indexStatus.built_at && (
                  <span className="rag-status-time">
                    构建时间：{new Date(indexStatus.built_at).toLocaleString()}
                  </span>
                )}
              </div>
            ) : (
              <div className="rag-index-status">
                <span className="rag-status-dot" />
                <span>未建立索引</span>
              </div>
            )}

            {/* 索引管理按钮 */}
            <div className="rag-index-actions">
              {!indexStatus.indexed && (
                <button
                  className="btn-primary"
                  onClick={handleBuildIndex}
                  disabled={building}
                >
                  {building ? "构建中..." : "重建索引"}
                </button>
              )}
              {indexStatus.indexed && (
                <>
                  <button
                    className="btn-primary"
                    onClick={handleRefreshIndex}
                    disabled={building}
                  >
                    {building ? "刷新中..." : "刷新索引"}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={handleBuildIndex}
                    disabled={building}
                  >
                    重建索引
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={handleDeleteIndex}
                    disabled={deleting || building}
                  >
                    删除索引
                  </button>
                </>
              )}
            </div>

            {indexMessage && (
              <div className={`settings-message ${indexMessage.startsWith("✗") ? "error" : "success"}`}>
                {indexMessage}
              </div>
            )}
          </div>

          {/* 检索测试 */}
          <div className="settings-section">
            <h3>检索测试</h3>
            <div className="rag-search-input-row">
              <input
                type="text"
                className="rag-search-input"
                placeholder="输入查询内容，测试语义检索效果..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!indexStatus.indexed}
              />
              <button
                className="btn-primary rag-search-btn"
                onClick={handleSearch}
                disabled={searching || !indexStatus.indexed || !query.trim()}
              >
                {searching ? "检索中..." : "检索"}
              </button>
            </div>

            {searchError && (
              <div className="settings-message error">{searchError}</div>
            )}

            {/* 结果列表 */}
            {results.length > 0 && (
              <div className="rag-result-list">
                <div className="rag-result-count">找到 {results.length} 条结果</div>
                {results.map((r, idx) => (
                  <div
                    key={idx}
                    className="rag-result-item"
                    onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  >
                    <div className="rag-result-header">
                      <span className="rag-result-heading">{r.heading || "(无标题)"}</span>
                      <span className="rag-result-score">{formatScore(r.score)}</span>
                    </div>
                    <div className="rag-result-file">{getFileName(r.source_path)}</div>
                    <div className="rag-result-text">
                      {expandedIdx === idx ? r.text : truncate(r.text, 120)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {results.length === 0 && !searchError && query && !searching && indexStatus.indexed && (
              <div className="rag-result-empty">未找到相关内容，请尝试其他查询</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
