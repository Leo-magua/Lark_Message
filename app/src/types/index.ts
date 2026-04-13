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
  syncMode?: 'latest' | 'full';
  syncLimit?: number;
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
  syncMode?: 'latest' | 'full';
  syncLimit?: number;
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
  enabled: number; // 0/1
}

export interface Topic {
  id: string;
  topic_id: string;
  name: string;
  color: string;
  visible: boolean;
}

export interface TimelineEvent {
  id: string;
  title: string;
  summary: string;
  /** list of topic_id strings */
  topics: string[];
  occurred_at: string;
  source_contact_id?: string;
  source_chat_id?: string;
}

export interface Settings {
  openaiKey: string;
  openaiUrl: string;
  kimiCommand: string;
  autoReplyEnabled: boolean;
  modelId: string;
}

export const topicColors = [
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
];

/** Single message in contact summary (with id for deletion) */
export interface ContactMessage {
  id: number;
  sender: string;
  content: string;
  time: string;
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
