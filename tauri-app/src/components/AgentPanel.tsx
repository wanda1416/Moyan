import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAgent } from "../hooks/useAgent";
import { useLogger } from "../hooks/useLogger";
import ChatMessage from "./ChatMessage";
import type { SessionSummary } from "../types";

interface AgentPanelProps {
  currentFile: string | null;
  projectRoot: string | null;
}

export default function AgentPanel({ currentFile, projectRoot }: AgentPanelProps) {
  const {
    messages,
    connected,
    connect,
    disconnect,
    sendChat,
    setCurrentFile,
    sessions,
    currentSessionId,
    setProjectRoot,
    saveCurrentSession,
    deleteSession,
    startNewSession,
    switchSession,
  } = useAgent();

  const logger = useLogger();
  const [input, setInput] = useState("");
  const [pythonOnline, setPythonOnline] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSessionList, setShowSessionList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevFileRef = useRef<string | null>(null);
  const sessionDropdownRef = useRef<HTMLDivElement>(null);

  // 项目变化时通知 hook
  useEffect(() => {
    setProjectRoot(projectRoot);
  }, [projectRoot, setProjectRoot]);

  // 点击外部关闭会话下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sessionDropdownRef.current && !sessionDropdownRef.current.contains(e.target as Node)) {
        setShowSessionList(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 启动时持续轮询后端健康状态，直到连通
  const healthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkHttpHealth = useCallback(async () => {
    try {
      const ok = await invoke<boolean>("python_health_check");
      if (ok) {
        setPythonOnline(true);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      const ok = await checkHttpHealth();
      if (!ok && !cancelled) {
        // 后端未就绪，1 秒后重试
        healthTimerRef.current = setTimeout(poll, 1000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (healthTimerRef.current) {
        clearTimeout(healthTimerRef.current);
      }
    };
  }, [checkHttpHealth]);

  // Python 在线时自动连接 WebSocket
  useEffect(() => {
    if (pythonOnline && !connected) {
      connect();
    } else if (!pythonOnline && connected) {
      disconnect();
    }
  }, [pythonOnline, connected, connect, disconnect]);

  // 文件变化时通知 Python
  useEffect(() => {
    if (currentFile === prevFileRef.current) return;
    prevFileRef.current = currentFile;

    if (currentFile && connected) {
      setCurrentFile(currentFile);
    }
  }, [currentFile, connected, setCurrentFile]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 手动重连
  const handleReconnect = async () => {
    await checkHttpHealth();
    if (pythonOnline) connect();
  };

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || !pythonOnline || sending) return;

    const message = input.trim();
    setInput("");
    setSending(true);
    logger.info(`发送消息: ${message.slice(0, 50)}${message.length > 50 ? "..." : ""}`);

    try {
      await sendChat(message);
      logger.info("收到 LLM 回复");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "未知错误";
      logger.error(`发送失败: ${errorMsg}`);
      console.error("发送失败:", err);
    } finally {
      setSending(false);
    }
  };

  // 新建会话
  const handleNewSession = async () => {
    // 先保存当前会话
    if (messages.length > 0) {
      await saveCurrentSession();
    }
    startNewSession();
    setShowSessionList(false);
  };

  // 切换会话
  const handleSwitchSession = async (sessionId: string) => {
    if (sessionId === currentSessionId) {
      setShowSessionList(false);
      return;
    }
    await switchSession(sessionId);
    setShowSessionList(false);
  };

  // 删除会话
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm("确定要删除这个会话吗？")) return;
    await deleteSession(sessionId);
  };

  // 格式化时间
  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const statusText = !pythonOnline ? "后端离线" : "已连接";

  // 当前会话标题
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const displayTitle = currentSession?.title || (messages.length > 0 ? "新对话" : "对话");

  return (
    <div className="agent-panel-inner">
      <div className="agent-header">
        <div className="agent-header-top">
          <h3>AI 助手</h3>
          <div className="python-status-indicator" title={statusText}>
            <span className={`status-dot ${pythonOnline ? "connected" : "disconnected"}`} />
            <span className="status-text">{statusText}</span>
            {!pythonOnline && (
              <button className="reconnect-btn" onClick={handleReconnect} title="重连">
                ↻
              </button>
            )}
          </div>
        </div>

        {/* 会话选择器 */}
        <div className="session-selector" ref={sessionDropdownRef}>
          <button
            className="session-selector-btn"
            onClick={() => setShowSessionList(!showSessionList)}
            title="切换会话"
          >
            <span className="session-selector-title">{displayTitle}</span>
            <span className="session-selector-arrow">{showSessionList ? "▲" : "▼"}</span>
          </button>
          <button className="new-session-btn" onClick={handleNewSession} title="新建对话">
            +
          </button>

          {showSessionList && (
            <div className="session-dropdown">
              {sessions.length === 0 ? (
                <div className="session-dropdown-empty">暂无历史会话</div>
              ) : (
                sessions.map((s: SessionSummary) => (
                  <div
                    key={s.id}
                    className={`session-item ${s.id === currentSessionId ? "active" : ""}`}
                    onClick={() => handleSwitchSession(s.id)}
                  >
                    <div className="session-item-info">
                      <span className="session-item-title">{s.title}</span>
                      <span className="session-item-meta">
                        {formatTime(s.updated_at)} · {s.message_count} 条
                      </span>
                    </div>
                    <button
                      className="session-item-delete"
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      title="删除会话"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="agent-tabs">
          <button className="agent-tab active">对话</button>
          <button className="agent-tab">设定</button>
          <button className="agent-tab">伏笔</button>
        </div>
      </div>
      <div className="agent-messages">
        {messages.length === 0 && (
          <div className="agent-empty">
            {pythonOnline ? "已连接 · 就绪" : "等待后端启动..."}
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {sending && (
          <div className="agent-thinking">
            <span className="thinking-dot">●</span>
            <span className="thinking-dot">●</span>
            <span className="thinking-dot">●</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="agent-input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            !pythonOnline ? "等待后端启动..." : "输入消息..."
          }
          disabled={!pythonOnline || sending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !pythonOnline || sending}
        >
          {sending ? "..." : "发送"}
        </button>
      </div>
    </div>
  );
}
