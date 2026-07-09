import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAgent } from "../hooks/useAgent";
import { useLogger } from "../hooks/useLogger";
import ChatMessage from "./ChatMessage";

interface AgentPanelProps {
  currentFile: string | null;
}

export default function AgentPanel({ currentFile }: AgentPanelProps) {
  const { messages, connected, connect, disconnect, sendChat, setCurrentFile, clearMessages } = useAgent();
  const logger = useLogger();
  const [input, setInput] = useState("");
  const [pythonOnline, setPythonOnline] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevFileRef = useRef<string | null>(null);

  // 启动时检查 Python 状态
  const checkHttpHealth = useCallback(async () => {
    try {
      const ok = await invoke<boolean>("python_health_check");
      setPythonOnline(ok);
    } catch {
      setPythonOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHttpHealth();
  }, [checkHttpHealth]);

  // Python 在线时自动连接 WebSocket（用于未来的 Agent 功能）
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

  // 发送消息 - 直接调用 LLM
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

  const statusText = !pythonOnline ? "后端离线" : "已连接";

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
        <div className="agent-tabs">
          <button className="agent-tab active">对话</button>
          <button className="agent-tab">设定</button>
          <button className="agent-tab">伏笔</button>
        </div>
        <div className="agent-selector">
          <button
            className="clear-btn"
            onClick={clearMessages}
            title="清空对话"
            disabled={messages.length === 0}
          >
            ✕
          </button>
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
