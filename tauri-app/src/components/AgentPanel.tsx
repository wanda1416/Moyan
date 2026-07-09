import { useState } from "react";
import ChatMessage from "./ChatMessage";
import type { AgentMessage } from "../types";

interface AgentPanelProps {
  currentFile: string | null;
}

export default function AgentPanel({ currentFile }: AgentPanelProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: AgentMessage = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };
    setMessages([...messages, userMsg]);
    setInput("");

    // TODO: 通过 WebSocket 发送给 Python Agent
  };

  return (
    <div className="agent-panel-inner">
      <div className="agent-header">
        <h3>Agent 助手</h3>
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
          placeholder={currentFile ? "输入问题或指令..." : "请先打开一个文件"}
          disabled={!currentFile}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button onClick={handleSend} disabled={!currentFile || !input.trim()}>
          发送
        </button>
      </div>
    </div>
  );
}
