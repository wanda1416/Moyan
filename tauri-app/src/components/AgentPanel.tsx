import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAgent } from "../hooks/useAgent";
import ChatMessage from "./ChatMessage";
import type { AgentType } from "../types";

interface AgentPanelProps {
  currentFile: string | null;
}

const AGENT_LABELS: Record<AgentType, string> = {
  lore_keeper: "设定顾问",
  beat_maker: "节拍师",
  scribe: "写手",
  guardian: "守夜人",
  foreshadowing_clerk: "伏笔官",
};

export default function AgentPanel({ currentFile }: AgentPanelProps) {
  const { messages, connected, connect, disconnect, send, setCurrentFile, clearMessages } = useAgent();
  const [input, setInput] = useState("");
  const [pythonOnline, setPythonOnline] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("lore_keeper");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevFileRef = useRef<string | null>(null);

  // 轮询 Python HTTP 健康检查
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
    const timer = setInterval(checkHttpHealth, 5000);
    return () => clearInterval(timer);
  }, [checkHttpHealth]);

  // Python 在线时自动连接 WebSocket
  useEffect(() => {
    if (pythonOnline && !connected) {
      connect();
    } else if (!pythonOnline && connected) {
      disconnect();
    }
  }, [pythonOnline, connected, connect, disconnect]);

  // 文件变化时通知 Python 并获取关联文件
  useEffect(() => {
    if (currentFile === prevFileRef.current) return;
    prevFileRef.current = currentFile;

    if (currentFile && connected) {
      setCurrentFile(currentFile);
    }
  }, [currentFile, connected, setCurrentFile]);

  // 监听 set_current_file 响应中的关联文件
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.agent_type === undefined && lastMsg?.content?.startsWith("当前文件:")) {
      // 这是 set_current_file 的响应，关联文件已通过 structured_data 返回
      // 但 useAgent 目前只传递 content/references，references 已包含在 AgentMessage 中
      // 这里暂时不处理，后续可扩展
    }
  }, [messages]);

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
    if (!input.trim() || !connected || sending) return;

    const question = input.trim();
    setInput("");
    setSending(true);

    try {
      await send({
        action: "query",
        agent_type: selectedAgent,
        payload: { question, file_path: currentFile },
      });
    } catch (err) {
      // 错误消息已由 useAgent 处理
      console.error("发送失败:", err);
    } finally {
      setSending(false);
    }
  };

  const statusText = !pythonOnline
    ? "后端离线"
    : connected
    ? "已连接"
    : "连接中...";

  const statusConnected = pythonOnline && connected;

  return (
    <div className="agent-panel-inner">
      <div className="agent-header">
        <div className="agent-header-top">
          <h3>Agent 助手</h3>
          <div className="python-status-indicator" title={statusText}>
            <span className={`status-dot ${statusConnected ? "connected" : "disconnected"}`} />
            <span className="status-text">{statusText}</span>
            {!statusConnected && (
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
        {/* Agent 类型选择 */}
        <div className="agent-selector">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value as AgentType)}
            disabled={!connected}
          >
            {(Object.entries(AGENT_LABELS) as [AgentType, string][]).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
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
            {connected
              ? `已连接 · ${AGENT_LABELS[selectedAgent]}就绪`
              : pythonOnline
              ? "正在连接 WebSocket..."
              : "等待 Python 后端启动..."}
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
            !pythonOnline
              ? "等待后端启动..."
              : !connected
              ? "连接中..."
              : !currentFile
              ? "请先打开一个文件"
              : `向${AGENT_LABELS[selectedAgent]}提问...`
          }
          disabled={!currentFile || !connected || sending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          onClick={handleSend}
          disabled={!currentFile || !input.trim() || !connected || sending}
        >
          {sending ? "..." : "发送"}
        </button>
      </div>
    </div>
  );
}
