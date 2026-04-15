export interface Person {
  id: string;
  name: string;
  avatar: string;
  title?: string;
  contact_type: 'person' | 'group';
  member_count?: number;
  tags: string[];
  knows: string[];
  lastTalk: string;
  talkCount: number;
  autoReply: boolean;
  /** null = 使用设置页全局默认 */
  syncMode?: 'latest' | 'full' | null;
  syncLimit?: number | null;
  /** 用户简介（可手动编辑或由 AI 根据聊天记录生成） */
  intro?: string;
}

export interface Channel {
  id: string;
  type: 'group' | 'person';
  name: string;
  avatar?: string;
  members?: number;
  isMonitoring: boolean;
  lastActive: string;
  hasAlert: boolean;
  summary: string;
  autoReply: boolean;
  syncMode?: 'latest' | 'full' | null;
  syncLimit?: number | null;
}

/** Auto-reply channel enriched with config */
export interface AutoReplyChannel extends Channel {
  enabled: boolean;           // from auto_reply_config.enabled
  config?: {
    id: number;
    channelType: 'person' | 'group';
    channelId: string;
    templateId: number | null;
    knowledgeTags: string[];
    customContext: string;
    systemPrompt: string;
    enabled: number;
    updatedAt: string;
  } | null;
}

export interface Knowledge {
  id: number;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export interface Template {
  id: number;
  name: string;
  systemPrompt: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
}

export interface AutoReplyConfig {
  id: number;
  channelType: 'person' | 'group';
  channelId: string;
  templateId: number | null;
  knowledgeTags: string[];
  customContext: string;
  systemPrompt: string;
  enabled: number; // 0/1
}

export interface Topic {
  id: string;
  topic_id: string;
  name: string;
  /** 主题说明，供后端自动归类 LLM 使用 */
  topic_context?: string;
  color: string;
  visible: boolean;
}

/** POST/PATCH /api/events 时主题自动归类结果 */
export interface EventTopicAutoPayload {
  applied: boolean;
  skipped?: boolean;
  topic_ids?: string[];
  error?: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  summary: string;
  /** AI 提取：主要发言者及观点/原话要点 */
  speaker_highlights?: string;
  /** list of topic_id strings */
  topics: string[];
  occurred_at: string;
  /** 与事件页一致；为 true 时可在时间轴上弱化展示 */
  timeline_hidden?: boolean;
  source_contact_id?: string;
  source_chat_id?: string;
}

/** 事件管理表 / API 全量字段（含是否从时间轴隐藏） */
export interface ManagedEvent {
  id: string;
  title: string;
  summary: string;
  speaker_highlights?: string;
  topics: string[];
  occurred_at: string;
  timeline_hidden: boolean;
  source_contact_id?: string;
  source_chat_id?: string;
  topic_auto?: EventTopicAutoPayload;
}

export interface Settings {
  openaiKey: string;
  openaiUrl: string;
  kimiCommand: string;
  modelId: string;
  /** 自动回复功能使用的全局系统提示词（独立于 AI 分析指令） */
  autoReplySystemPrompt: string;
  /** 后台定时同步通讯录中全部对象的消息 */
  messageSyncPollingEnabled: boolean;
  /** 同步间隔（秒），后端限制 30～7200 */
  messageSyncIntervalSec: number;
  /** Default sync mode for contacts without per-card overrides */
  defaultSyncMode: 'latest' | 'full';
  /** How many latest messages to fetch when mode=latest (per contact/group) */
  defaultSyncLimit: number;
  /** Hard cap for mode=full (still paginates until cap or no more pages) */
  fullSyncCap: number;
}

export const topicColors = [
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
];

/** 与 DB `messages.ai_analysis_status` 一致 */
export type MessageAiAnalysisStatusCode =
  | 'unprocessed'
  | 'contact_analyzed'
  | 'global_analyzed';

/** Single message in contact summary（含 AI 分析状态，由后端写入） */
export interface ContactMessage {
  id: number;
  sender: string;
  content: string;
  time: string;
  ai_analysis_status?: MessageAiAnalysisStatusCode;
  /** 中文展示：未处理 / 单对话中已处理 / 全局已处理 */
  ai_analysis_status_label?: string;
}

/** Contact summary with recent messages */
export interface ContactSummary {
  contact_id: string;
  name: string;
  avatar: string;
  contact_type: string;
  messages: ContactMessage[];
  last_message_at: string;
}

/** 通讯录详情中展示的、与该对象关联的 AI 事件（按 occurred_at 新→旧） */
export interface ContactLinkedEvent {
  id: string;
  title: string;
  summary: string;
  speaker_highlights?: string;
  occurred_at: string;
}
