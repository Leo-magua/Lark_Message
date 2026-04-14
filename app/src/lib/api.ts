// Central typed fetch wrapper for all backend API calls.
// In dev: Vite proxy forwards /api → localhost:8001（见 `app/vite.config.ts`）
// In prod: same-origin, no change needed

import type {
  Person,
  Channel,
  Topic,
  TimelineEvent,
  ManagedEvent,
  Settings,
  Knowledge,
  Template,
  AutoReplyChannel,
  AutoReplyConfig,
  ContactLinkedEvent,
  ContactSummary,
} from '@/types';

const BASE = '/api';

export interface SyncResult {
  success: boolean;
  synced: number;
  errors: string[];
}

export interface MessageSyncResult {
  success: boolean;
  totalInserted?: number;
  chats?: number;
  results?: Array<{ chatId: string; fetched: number; inserted: number; error?: string }>;
  // single-chat variant fields
  chatId?: string;
  fetched?: number;
  inserted?: number;
  error?: string;
}

export interface TimelineData {
  events: TimelineEvent[];
  topics: Topic[];
}

export interface AiAnalyzeResult {
  success: boolean;
  events?: number;
  topics?: number;
  error?: string;
}

export interface AiAnalyzeAllResult {
  success: boolean;
  processed: number;
  errors?: string[];
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    let detail = '';
    try {
      const j = JSON.parse(text) as { error?: string; message?: string };
      detail = (j.error ?? j.message ?? '').trim();
    } catch {
      if (text.trim()) detail = text.trim().slice(0, 300);
    }
    const suffix = detail ? `: ${detail}` : '';
    throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${res.status}${suffix}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${init?.method ?? 'GET'} ${url}: invalid JSON response`);
  }
}

export const api = {
  contacts: {
    /** Fetch all contacts from local DB (already-added ones only) */
    list: async (): Promise<{ contacts: Person[] }> => {
      return apiFetch<{ contacts: Person[] }>(`${BASE}/contacts`);
    },

    /** Live search via lark-cli (not from cache) */
    search: async (q: string, type: 'person' | 'group'): Promise<{ contacts: Person[] }> => {
      const url = `${BASE}/contacts/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`;
      return apiFetch<{ contacts: Person[] }>(url);
    },

    /** Add a searched contact/group into the local DB */
    add: async (contact: {
      id: string;
      name: string;
      avatar: string;
      title?: string;
      contact_type: 'person' | 'group';
    }): Promise<{ success: boolean }> => {
      return apiFetch<{ success: boolean }>(`${BASE}/contacts/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      });
    },

    /** Remove a contact from the local DB */
    remove: async (id: string): Promise<{ success: boolean }> => {
      return apiFetch<{ success: boolean }>(`${BASE}/contacts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },

    /** Update local enrichment fields (tags, knows, autoReply, sync settings, etc.)
     * Note: syncMode/syncLimit only apply to monitored contacts/chats
     */
    patch: async (
      id: string,
      data: Partial<Pick<Person, 'tags' | 'knows' | 'lastTalk' | 'talkCount' | 'autoReply' | 'intro'>> & {
        syncMode?: Person['syncMode'] | null;
        syncLimit?: number | null;
      }
    ): Promise<{ success: boolean }> => {
      const body: any = { ...data };
      // Convert snake_case for backend
      if (data.syncMode !== undefined) body.sync_mode = data.syncMode;
      if (data.syncLimit !== undefined) body.sync_limit = data.syncLimit;
      if (data.intro !== undefined) body.intro = data.intro;
      return apiFetch<{ success: boolean }>(`${BASE}/contacts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },

    /** Get recent message summary for a contact */
    summary: async (id: string): Promise<ContactSummary> => {
      return apiFetch(`${BASE}/contacts/${encodeURIComponent(id)}/summary`);
    },

    /** AI 分析写入的、与该联系人/群关联的事件（时间新→旧） */
    eventsForContact: async (id: string): Promise<{ events: ContactLinkedEvent[] }> => {
      return apiFetch<{ events: ContactLinkedEvent[] }>(
        `${BASE}/contacts/${encodeURIComponent(id)}/events`
      );
    },

    /** 根据本地已同步消息，用 LLM 生成简介（不自动落库，前端需再 PATCH intro） */
    summarizeIntro: async (
      id: string
    ): Promise<{ success: boolean; intro?: string; error?: string }> => {
      return apiFetch<{ success: boolean; intro?: string; error?: string }>(
        `${BASE}/contacts/${encodeURIComponent(id)}/intro-ai`,
        { method: 'POST' }
      );
    },
  },

  chats: {
    list: async (): Promise<Channel[]> => {
      return apiFetch<Channel[]>(`${BASE}/chats`);
    },

    update: async (chatId: string, patch: Partial<Pick<Channel, 'isMonitoring' | 'autoReply' | 'hasAlert' | 'syncMode' | 'syncLimit'>>): Promise<Channel> => {
      const body: any = { ...patch };
      if (patch.syncMode !== undefined) body.sync_mode = patch.syncMode;
      if (patch.syncLimit !== undefined) body.sync_limit = patch.syncLimit;
      return apiFetch<Channel>(`${BASE}/chats/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },

    sync: async (): Promise<SyncResult> => {
      return apiFetch<SyncResult>(`${BASE}/chats/sync`, { method: 'POST' });
    },
  },

  messages: {
    /** Sync messages for ALL monitored chats (may take a while) */
    syncAll: async (opts?: { fullSyncCap?: number }): Promise<MessageSyncResult> => {
      return apiFetch<MessageSyncResult>(`${BASE}/messages/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(opts ?? {}) }),
      });
    },

    /** Sync messages for a single chat by chatId */
    syncChat: async (chatId: string, maxMessages = 100): Promise<MessageSyncResult> => {
      return apiFetch<MessageSyncResult>(`${BASE}/messages/sync/${encodeURIComponent(chatId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMessages }),
      });
    },

    /** Sync P2P messages for a single person contact */
    syncContact: async (contactId: string, maxMessages = 50): Promise<MessageSyncResult> => {
      return apiFetch<MessageSyncResult>(`${BASE}/messages/sync-contact/${encodeURIComponent(contactId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMessages }),
      });
    },

    /** Delete a single message */
    delete: async (messageId: number): Promise<{ success: boolean }> => {
      return apiFetch<{ success: boolean }>(`${BASE}/messages/${messageId}`, { method: 'DELETE' });
    },

    /** Bulk delete messages */
    bulkDelete: async (ids: number[]): Promise<{ success: boolean; deleted: number }> => {
      return apiFetch<{ success: boolean; deleted: number }>(`${BASE}/messages/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    },

    /** Get all messages (with optional filters) */
    list: async (params?: { chatId?: string; limit?: number; offset?: number }): Promise<any> => {
      const sp = new URLSearchParams();
      if (params?.chatId) sp.set('chatId', params.chatId);
      if (params?.limit != null) sp.set('limit', String(params.limit));
      if (params?.offset != null) sp.set('offset', String(params.offset));
      const q = sp.toString();
      return apiFetch(`${BASE}/messages${q ? `?${q}` : ''}`);
    },
  },

  timeline: {
    /** Get AI-analyzed events + topics from backend */
    get: async (): Promise<TimelineData> => {
      return apiFetch<TimelineData>(`${BASE}/timeline`);
    },
  },

  events: {
    list: async (params?: { limit?: number; offset?: number }): Promise<{ events: ManagedEvent[] }> => {
      const sp = new URLSearchParams();
      if (params?.limit != null) sp.set('limit', String(params.limit));
      if (params?.offset != null) sp.set('offset', String(params.offset));
      const q = sp.toString();
      return apiFetch<{ events: ManagedEvent[] }>(`${BASE}/events${q ? `?${q}` : ''}`);
    },

    get: async (id: string): Promise<ManagedEvent> => {
      return apiFetch<ManagedEvent>(`${BASE}/events/${encodeURIComponent(id)}`);
    },

    create: async (data: {
      title: string;
      summary?: string;
      speaker_highlights?: string;
      occurred_at?: string;
      topic_ids?: string[];
      timeline_hidden?: boolean;
      source_chat_id?: string | null;
      source_contact_id?: string | null;
      /** 为 true 时跳过 LLM，仅按 topic_ids 写入 */
      skip_topic_auto_classify?: boolean;
    }): Promise<ManagedEvent> => {
      return apiFetch<ManagedEvent>(`${BASE}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },

    update: async (
      id: string,
      data: Partial<{
        title: string;
        summary: string;
        speaker_highlights: string;
        occurred_at: string;
        timeline_hidden: boolean;
        topic_ids: string[];
        source_chat_id: string | null;
        source_contact_id: string | null;
        skip_topic_auto_classify: boolean;
      }>
    ): Promise<ManagedEvent> => {
      return apiFetch<ManagedEvent>(`${BASE}/events/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },

    remove: async (id: string): Promise<void> => {
      await apiFetch<{ success: boolean }>(`${BASE}/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    bulkRemove: async (ids: string[]): Promise<{ success: boolean; deleted: number }> => {
      return apiFetch<{ success: boolean; deleted: number }>(`${BASE}/events/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    },
  },

  ai: {
    /** Trigger AI analysis for a single contact/chat */
    analyze: async (contactId: string, limit = 50): Promise<AiAnalyzeResult> => {
      return apiFetch<AiAnalyzeResult>(`${BASE}/ai/analyze/${encodeURIComponent(contactId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });
    },

    /** Trigger AI analysis for all chats */
    analyzeAll: async (limit = 50): Promise<AiAnalyzeAllResult> => {
      return apiFetch<AiAnalyzeAllResult>(`${BASE}/ai/analyze-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });
    },
  },

  topics: {
    list: async (): Promise<Topic[]> => {
      return apiFetch<Topic[]>(`${BASE}/topics`);
    },

    create: async (name: string, color: string, topic_context?: string): Promise<Topic> => {
      return apiFetch<Topic>(`${BASE}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, ...(topic_context !== undefined ? { topic_context } : {}) }),
      });
    },

    remove: async (topicId: string): Promise<void> => {
      await apiFetch<void>(`${BASE}/topics/${topicId}`, { method: 'DELETE' });
    },

    toggle: async (topicId: string, visible: boolean): Promise<void> => {
      await apiFetch<void>(`${BASE}/topics/${topicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible }),
      });
    },
  },

  settings: {
    get: async (): Promise<Settings> => {
      return apiFetch<Settings>(`${BASE}/settings`);
    },

    save: async (settings: Partial<Settings>): Promise<Settings> => {
      return apiFetch<Settings>(`${BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    },
  },

  // ── Knowledge Base ─────────────────────────────────────────────────────────
  knowledge: {
    list: async (): Promise<{ knowledge: Knowledge[] }> => {
      return apiFetch<{ knowledge: Knowledge[] }>(`${BASE}/knowledge`);
    },

    create: async (data: { title: string; content: string; tags: string[] }): Promise<Knowledge> => {
      return apiFetch<Knowledge>(`${BASE}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },

    update: async (id: number, data: Partial<{ title: string; content: string; tags: string[] }>): Promise<Knowledge> => {
      return apiFetch<Knowledge>(`${BASE}/knowledge/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },

    delete: async (id: number): Promise<void> => {
      await apiFetch<void>(`${BASE}/knowledge/${id}`, { method: 'DELETE' });
    },
  },

  // ── Reply Templates ─────────────────────────────────────────────────────────
  templates: {
    list: async (): Promise<{ templates: Template[] }> => {
      return apiFetch<{ templates: Template[] }>(`${BASE}/templates`);
    },

    create: async (data: { name: string; systemPrompt: string; description?: string; isDefault?: boolean }): Promise<Template> => {
      return apiFetch<Template>(`${BASE}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },

    update: async (id: number, data: Partial<{ name: string; systemPrompt: string; description: string }>): Promise<Template> => {
      return apiFetch<Template>(`${BASE}/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },

    delete: async (id: number): Promise<void> => {
      await apiFetch<void>(`${BASE}/templates/${id}`, { method: 'DELETE' });
    },

    setDefault: async (id: number): Promise<void> => {
      await apiFetch<void>(`${BASE}/templates/${id}/default`, { method: 'POST' });
    },
  },

  // ── Auto-Reply Channels & Config ───────────────────────────────────────────
  autoReply: {
    /** Get all channels that have auto-reply enabled (or all for selection) */
    getChannels: async (): Promise<{ channels: AutoReplyChannel[] }> => {
      return apiFetch<{ channels: AutoReplyChannel[] }>(`${BASE}/auto-reply/channels`);
    },

    /** Toggle auto-reply status for a channel */
    toggle: async (channelId: string): Promise<{ success: boolean }> => {
      return apiFetch<{ success: boolean }>(`${BASE}/auto-reply/toggle/${encodeURIComponent(channelId)}`, {
        method: 'POST',
      });
    },

    /** Get config for a specific channel */
    getConfig: async (channelType: 'person' | 'group', channelId: string): Promise<AutoReplyConfig> => {
      return apiFetch<AutoReplyConfig>(`${BASE}/auto-reply/config/${channelType}/${channelId}`);
    },

    /** Save config for a specific channel */
    setConfig: async (
      channelType: 'person' | 'group',
      channelId: string,
      data: { templateId: number | null; knowledgeTags: string[]; customContext: string; enabled: boolean }
    ): Promise<{ success: boolean }> => {
      return apiFetch<{ success: boolean }>(`${BASE}/auto-reply/config/${channelType}/${channelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
  },
};
