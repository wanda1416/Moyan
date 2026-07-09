import { useState, useCallback, useRef } from "react";
import type { AgentMessage, AgentRequest, AgentResponse } from "../types";

const WS_URL = "ws://localhost:8765/ws";

export function useAgent() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current) return;

    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const response: AgentResponse = JSON.parse(event.data);
        const agentMsg: AgentMessage = {
          role: "agent",
          content: response.content,
          timestamp: new Date().toISOString(),
          agent_type: response.agent_type,
          references: response.references,
        };
        setMessages((prev) => [...prev, agentMsg]);
      } catch (err) {
        console.error("解析 Agent 响应失败:", err);
      }
    };
    wsRef.current = ws;
  }, []);

  const send = useCallback((request: AgentRequest) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket 未连接");
      return;
    }

    const userMsg: AgentMessage = {
      role: "user",
      content: JSON.stringify(request),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    wsRef.current.send(JSON.stringify(request));
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  return { messages, connected, connect, send, disconnect };
}
