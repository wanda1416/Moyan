import type { AgentMessage } from "../types";

interface ChatMessageProps {
  message: AgentMessage;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`chat-message ${isUser ? "user" : "agent"}`}>
      <div className="chat-avatar">{isUser ? "我" : "AI"}</div>
      <div className="chat-content">
        <div className="chat-text">{message.content}</div>
        <div className="chat-time">
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
