import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import ChatMessage from "./ChatMessage";
import type { AgentMessage } from "../types";

interface AgentPanelProps {
  currentFile: string | null;
}

export default function AgentPanel({ currentFile }: AgentPanelProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [pythonConnected, setPythonConnected] = useState(false);
  const [pythonStatus, setPythonStatus] = useState<string>("检查中...");

  // 轮询 Python 后端连接状态
  const checkHealth = useCallback(async () => {
    try {
      const ok = await invoke<boolean>("python_health_check");
      setPythonConnected(ok);
      setPythonStatus(ok ? "已连接" : "未连接");
    } catch {
      setPythonConnected(false);
      setPythonStatus("未连接");
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 5000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  // 手动启动/重连 Python 后端
  const handleReconnect = async () => {
    setPythonStatus("启动中...");
    try {
      const msg = await invoke<string>("start_python");
      setPythonStatus(msg.includes("失败") ? "启动失败" : "已连接");
      await checkHealth();
    } catch (e) {
      setPythonStatus(`错误: ${e}`);
    }
  };

  const handleSend = () => {
    if (!input.trim() || !pythonConnected) return;

    const userMsg: AgentMessage = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };
    setMessages([...messages, userMsg]);
    setInput("");

    // TODO: 通过 WebSocket 发送给 Python Agent（Phase 2.2 实现）
    const placeholderMsg: AgentMessage = {
      role: "agent",
      content: `[通信链路待接通] 收到消息: "${userMsg.content}"\n\nPython 后端已连接，WebSocket 通信将在 Phase 2.2 实现。`,
      timestamp: new Date().toISOString(),
      agent_type: "system",
    };
    setTimeout(() => {
      setMessages((prev) => [...prev, placeholderMsg]);
    }, 300);
  };

  return (
    <div className="agent-panel-inner">
      <div className="agent-header">
        <div className="agent-header-top">
          <h3>Agent 助手</h3>
          <div className="python-status-indicator" title={pythonStatus}>
            <span className={`status-dot ${pythonConnected ? "connected" : "disconnected"}`} />
            <span className="status-text">{pythonStatus}</span>
            {!pythonConnected && (
              <button className="reconnect-btn" onClick={handleReconnect} title="启动/重连 Python 后端">
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
      </div>
      <div className="agent-messages">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
      </div>
      <div className="agent-input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            !pythonConnected
              ? "Python 后端未连接..."
              : currentFile
              ? "输入问题或指令..."
              : "请先打开一个文件"
          }
          disabled={!currentFile || !pythonConnected}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          onClick={handleSend}
          disabled={!currentFile || !input.trim() || !pythonConnected}
        >
          发送
        </button>
      </div>
    </div>
  );
}
