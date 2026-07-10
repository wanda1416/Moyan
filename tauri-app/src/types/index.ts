/** 文件系统节点 */
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

/** Agent 消息 */
export interface AgentMessage {
  role: "user" | "agent" | "system";
  content: string;
  timestamp: string;
  agent_type?: string;
  references?: string[];
}

/** Agent 类型 */
export type AgentType = "lore_keeper" | "beat_maker" | "scribe" | "guardian" | "foreshadowing_clerk";

/** Agent 请求 */
export interface AgentRequest {
  action: string;
  agent_type: AgentType;
  chapter?: string;
  context?: string[];
  payload?: Record<string, unknown>;
}

/** Agent 响应 */
export interface AgentResponse {
  success: boolean;
  agent_type: AgentType;
  content: string;
  references?: string[];
  structured_data?: Record<string, unknown>;
}

/** 伏笔条目 */
export interface ForeshadowingItem {
  id: string;
  description: string;
  planted_in: string;
  resolved_in?: string;
  status: "pending" | "resolved";
}

/** 章节元数据 (Frontmatter) */
export interface ChapterMeta {
  id: string;
  title: string;
  volume: string;
  volume_id: string;
  chapter_number: number;
  status: "draft" | "review" | "finalized";
  word_count: number;
  tags: string[];
  characters: string[];
  foreshadowing_planted: string[];
  foreshadowing_resolved: string[];
  prev_chapter?: string;
  next_chapter?: string;
  created_at: string;
  updated_at: string;
}

/** 校验警告 */
export interface ContinuityWarning {
  type: "character" | "setting" | "timeline" | "foreshadowing";
  severity: "info" | "warning" | "error";
  message: string;
  file?: string;
  line?: number;
}

/** 会话摘要（列表显示用） */
export interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

/** 会话完整数据 */
export interface SessionData {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AgentMessage[];
}
