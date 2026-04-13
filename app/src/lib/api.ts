// Central typed fetch wrapper for all backend API calls.
// In dev: Vite proxy forwards /api → localhost:3001
// In prod: same-origin, no change needed

import type { Person, Channel, Topic, TimelineEvent, Settings, Knowledge, Template, AutoReplyChannel, AutoReplyConfig } from '@/types';

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
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
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
      data: Partial<Pick<Person, 'tags' | 'knows' | 'lastTalk' | 'talkCount' | 'autoReply' | 'syncMode' | 'syncLimit'>>
    ): Promise<{ success: boolean }> => {
      const body: any = { ...data };
      // Convert snake_case for backend
      if (data.syncMode !== undefined) body.sync_mode = data.syncMode;
      if (data.syncLimit !== undefined) body.sync_limit = data.syncLimit;
      return apiFetch<{ success: boolean }>(`${BASE}/contacts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },

    /** Get recent message summary for a contact */
    summary: async (id: string): Promise<{
      contact_id: string;
      name: string;
      avatar: string;
      contact_type: string;
      messages: Array<{ id: number; sender: string; content: string; time: string }>;
      last_message_at: string;
    }> => {
      return apiFetch(`${BASE}/contacts/${encodeURIComponent(id)}/summary`);
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
    syncAll: async (maxPerChat = 50): Promise<MessageSyncResult> => {
      return apiFetch<MessageSyncResult>(`${BASE}/messages/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxPerChat }),
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
      const url = new URL(`${BASE}/messages`);
      if (params?.chatId) url.searchParams.set('chatId', params.chatId);
      if (params?.limit) url.searchParams.set('limit', String(params.limit));
      if (params?.offset) url.searchParams.set('offset', String(params.offset));
      return apiFetch(url.toString());
    },
  },

  timeline: {
    /** Get AI-analyzed events + topics from backend */
    get: async (): Promise<TimelineData> => {
      return apiFetch<TimelineData>(`${BASE}/timeline`);
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

    create: async (name: string, color: string): Promise<Topic> => {
      return apiFetch<Topic>(`${BASE}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
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
