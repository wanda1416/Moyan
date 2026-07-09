import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentMessage, AgentRequest, AgentResponse, AgentType } from "../types";

const WS_URL = "ws://localhost:8765/ws";
const MAX_RECONNECT_DELAY = 30000;

interface PendingRequest {
  resolve: (value: AgentResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function useAgent() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdCounterRef = useRef(0);
  const shouldConnectRef = useRef(false);

  // 生成唯一请求 ID
  const nextRequestId = useCallback(() => {
    requestIdCounterRef.current += 1;
    return `req_${Date.now()}_${requestIdCounterRef.current}`;
  }, []);

  // 处理收到的消息
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const response: AgentResponse & { request_id?: string } = JSON.parse(event.data);
      const requestId = response.request_id;

      // 匹配待处理的请求
      if (requestId && pendingRef.current.has(requestId)) {
        const pending = pendingRef.current.get(requestId)!;
        pendingRef.current.delete(requestId);
        clearTimeout(pending.timer);
        pending.resolve(response);
      }

      // 添加到消息列表
      const agentMsg: AgentMessage = {
        role: "agent",
        content: response.content || "",
        timestamp: new Date().toISOString(),
        agent_type: response.agent_type || undefined,
        references: response.references,
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      console.error("解析 Agent 响应失败:", err);
    }
  }, []);

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    shouldConnectRef.current = true;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptRef.current = 0;
      // 清理待处理请求
      pendingRef.current.forEach((p) => {
        clearTimeout(p.timer);
        p.reject(new Error("连接已重置"));
      });
      pendingRef.current.clear();
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // 自动重连
      if (shouldConnectRef.current) {
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
        reconnectAttemptRef.current = attempt + 1;
        reconnectTimerRef.current = setTimeout(() => connect(), delay);
      }
    };

    ws.onerror = () => {
      // onerror 后会触发 onclose，重连逻辑在 onclose 中处理
    };

    ws.onmessage = handleMessage;
  }, [handleMessage]);

  // 断开连接
  const disconnect = useCallback(() => {
    shouldConnectRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    // 清理待处理请求
    pendingRef.current.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error("连接已断开"));
    });
    pendingRef.current.clear();
  }, []);

  // 发送请求并等待响应
  const send = useCallback(
    (request: AgentRequest): Promise<AgentResponse> => {
      return new Promise((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket 未连接"));
          return;
        }

        const requestId = nextRequestId();
        const fullRequest = { ...request, request_id: requestId };

        // 添加用户消息到列表
        const userMsg: AgentMessage = {
          role: "user",
          content: String(request.payload?.question || request.payload?.instruction || JSON.stringify(request)),
          timestamp: new Date().toISOString(),
          agent_type: request.agent_type,
        };
        setMessages((prev) => [...prev, userMsg]);

        // 设置超时（60秒）
        const timer = setTimeout(() => {
          if (pendingRef.current.has(requestId)) {
            pendingRef.current.delete(requestId);
            reject(new Error("请求超时"));
          }
        }, 60000);

        pendingRef.current.set(requestId, { resolve, reject, timer });
        wsRef.current.send(JSON.stringify(fullRequest));
      });
    },
    [nextRequestId]
  );

  // 发送设置当前文件请求
  const setCurrentFile = useCallback(
    (filePath: string | null) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const requestId = nextRequestId();
      const request = {
        request_id: requestId,
        agent_type: null as AgentType | null,
        action: "set_current_file",
        file_path: filePath,
      };
      wsRef.current.send(JSON.stringify(request));
    },
    [nextRequestId]
  );

  // 清空消息
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // 组件卸载时断开连接
  useEffect(() => {
    return () => {
      shouldConnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  return {
    messages,
    connected,
    connect,
    disconnect,
    send,
    setCurrentFile,
    clearMessages,
  };
}
