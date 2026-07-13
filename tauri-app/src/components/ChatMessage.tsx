import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentMessage } from "../types";

interface ChatMessageProps {
  message: AgentMessage;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const hasReferences = !isUser && message.references && message.references.length > 0;

  return (
    <div className={`chat-message ${isUser ? "user" : "agent"}`}>
      <div className="chat-avatar">{isUser ? "我" : message.agent_type ? getAgentEmoji(message.agent_type) : "AI"}</div>
      <div className="chat-content">
        {message.agent_type && !isUser && (
          <div className="chat-agent-label">{getAgentLabel(message.agent_type)}</div>
        )}
        <div className={`chat-text${!isUser ? " markdown-body" : ""}`}>
          {!isUser ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          ) : (
            message.content
          )}
        </div>
        {hasReferences && (
          <div className="chat-references">
            <span className="ref-label">引用来源:</span>
            {message.references!.map((ref, i) => (
              <span key={i} className="ref-item" title={ref}>
                {getFileName(ref)}
              </span>
            ))}
          </div>
        )}
        <div className="chat-time">
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function getFileName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function getAgentEmoji(type: string): string {
  const map: Record<string, string> = {
    lore_keeper: "📚",
    beat_maker: "🎵",
    scribe: "✍️",
    guardian: "🛡️",
    foreshadowing_clerk: "🔮",
  };
  return map[type] || "🤖";
}

function getAgentLabel(type: string): string {
  const map: Record<string, string> = {
    lore_keeper: "设定顾问",
    beat_maker: "节拍师",
    scribe: "写手",
    guardian: "守夜人",
    foreshadowing_clerk: "伏笔官",
  };
  return map[type] || type;
}
