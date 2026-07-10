import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AgentMessage, AgentRequest, AgentResponse, AgentType, SessionSummary, SessionData } from "../types";

const WS_URL = "ws://localhost:8765/ws";
const HTTP_URL = "http://localhost:8765";
const MAX_RECONNECT_DELAY = 30000;

interface PendingRequest {
  resolve: (value: AgentResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function useAgent() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdCounterRef = useRef(0);
  const shouldConnectRef = useRef(false);
  const messagesRef = useRef<AgentMessage[]>([]);
  const projectRootRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  // 同步 ref 和 state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // 生成唯一请求 ID
  const nextRequestId = useCallback(() => {
    requestIdCounterRef.current += 1;
    return `req_${Date.now()}_${requestIdCounterRef.current}`;
  }, []);

  // 设置项目根目录（用于会话存储）
  const setProjectRoot = useCallback((root: string | null) => {
    projectRootRef.current = root;
    if (root) {
      loadSessions();
    } else {
      setSessions([]);
      setCurrentSessionId(null);
    }
  }, []);

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    const projectRoot = projectRootRef.current;
    if (!projectRoot) return;
    try {
      const list = await invoke<SessionSummary[]>("list_sessions", { projectPath: projectRoot });
      setSessions(list);
      // 加载当前激活会话
      const activeId = await invoke<string | null>("get_current_session", { projectPath: projectRoot });
      if (activeId) {
        await loadSession(activeId);
      }
    } catch (err) {
      console.error("加载会话列表失败:", err);
    }
  }, []);

  // 加载指定会话
  const loadSession = useCallback(async (sessionId: string) => {
    const projectRoot = projectRootRef.current;
    if (!projectRoot) return;
    try {
      const data = await invoke<SessionData>("load_session", {
        projectPath: projectRoot,
        sessionId,
      });
      setMessages(data.messages);
      setCurrentSessionId(sessionId);
      // 保存为当前激活会话
      await invoke("set_current_session", {
        projectPath: projectRoot,
        sessionId,
      });
    } catch (err) {
      console.error("加载会话失败:", err);
    }
  }, []);

  // 保存当前会话
  const saveCurrentSession = useCallback(async () => {
    const projectRoot = projectRootRef.current;
    const currentMessages = messagesRef.current;
    if (!projectRoot || currentMessages.length === 0) return;

    let sessionId = currentSessionIdRef.current;
    if (!sessionId) {
      // 创建新会话 ID
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // 自动生成标题：取第一条用户消息的前 20 字符
    const firstUserMsg = currentMessages.find((m) => m.role === "user");
    const title = firstUserMsg
      ? firstUserMsg.content.slice(0, 20) + (firstUserMsg.content.length > 20 ? "..." : "")
      : "新对话";

    try {
      await invoke("save_session", {
        projectPath: projectRoot,
        sessionId,
        title,
        messages: currentMessages,
      });
      setCurrentSessionId(sessionId);
      // 刷新会话列表
      const list = await invoke<SessionSummary[]>("list_sessions", { projectPath: projectRoot });
      setSessions(list);
    } catch (err) {
      console.error("保存会话失败:", err);
    }
  }, []);

  // 删除会话
  const deleteSession = useCallback(async (sessionId: string) => {
    const projectRoot = projectRootRef.current;
    if (!projectRoot) return;
    try {
      await invoke("delete_session", {
        projectPath: projectRoot,
        sessionId,
      });
      // 如果删除的是当前会话，清空当前状态
      if (currentSessionIdRef.current === sessionId) {
        setMessages([]);
        setCurrentSessionId(null);
        await invoke("set_current_session", {
          projectPath: projectRoot,
          sessionId: null,
        });
      }
      // 刷新列表
      const list = await invoke<SessionSummary[]>("list_sessions", { projectPath: projectRoot });
      setSessions(list);
    } catch (err) {
      console.error("删除会话失败:", err);
    }
  }, []);

  // 新建会话（清空当前对话）
  const startNewSession = useCallback(() => {
    setMessages([]);
    setCurrentSessionId(null);
  }, []);

  // 切换会话
  const switchSession = useCallback(async (sessionId: string) => {
    // 先保存当前会话
    if (messagesRef.current.length > 0) {
      await saveCurrentSession();
    }
    // 加载目标会话
    await loadSession(sessionId);
  }, [saveCurrentSession, loadSession]);

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
      pendingRef.current.forEach((p) => {
        clearTimeout(p.timer);
        p.reject(new Error("连接已重置"));
      });
      pendingRef.current.clear();
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (shouldConnectRef.current) {
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
        reconnectAttemptRef.current = attempt + 1;
        reconnectTimerRef.current = setTimeout(() => connect(), delay);
      }
    };

    ws.onerror = () => {};
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

        const userMsg: AgentMessage = {
          role: "user",
          content: String(request.payload?.question || request.payload?.instruction || JSON.stringify(request)),
          timestamp: new Date().toISOString(),
          agent_type: request.agent_type,
        };
        setMessages((prev) => [...prev, userMsg]);

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

  // 简单对话接口 - 直接调用 LLM
  const sendChat = useCallback(
    async (userMessage: string): Promise<string> => {
      // 添加用户消息到列表
      const userMsg: AgentMessage = {
        role: "user",
        content: userMessage,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const currentMessages = messagesRef.current;
        const chatMessages = [
          ...currentMessages.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          })),
          { role: "user", content: userMessage },
        ];

        const body: Record<string, unknown> = { messages: chatMessages };
        if (projectRootRef.current) {
          body.project_root = projectRootRef.current;
        }

        const response = await fetch(`${HTTP_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await response.json();

        if (data.status === "error") {
          throw new Error(data.message);
        }

        const reply = data.reply || "";

        // 添加 AI 回复到列表
        const agentMsg: AgentMessage = {
          role: "agent",
          content: reply,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, agentMsg]);

        // 自动保存会话（延迟执行，不阻塞 UI）
        setTimeout(() => {
          saveCurrentSession();
        }, 100);

        return reply;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "未知错误";
        const agentMsg: AgentMessage = {
          role: "agent",
          content: `错误: ${errorMsg}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, agentMsg]);
        throw err;
      }
    },
    [saveCurrentSession]
  );

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
    sendChat,
    setCurrentFile,
    clearMessages,
    // 会话管理
    sessions,
    currentSessionId,
    setProjectRoot,
    loadSessions,
    loadSession,
    saveCurrentSession,
    deleteSession,
    startNewSession,
    switchSession,
  };
}
