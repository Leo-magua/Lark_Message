import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { topicColors } from '@/types';
import type { Topic, TimelineEvent } from '@/types';

type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';
type AiStatus = 'idle' | 'analyzing' | 'done' | 'error';

export function useTimeline() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiInfo, setAiInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.timeline.get();
      // 时间轴主列表与「事件」页同源（全量、含 timeline_hidden）；通讯录详情仍按联系人 id 另查
      setTopics(data.topics ?? []);
      setEvents(data.events ?? []);
    } catch (err) {
      console.warn('[useTimeline] Failed to load timeline:', err);
      setTopics([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Sync messages for all monitored chats, then reload timeline */
  const syncMessages = useCallback(async (opts?: { fullSyncCap?: number }) => {
    setSyncStatus('syncing');
    setSyncInfo(null);
    try {
      const result = await api.messages.syncAll(opts);
      const info = `同步完成：${result.totalInserted ?? 0} 条新消息（${result.chats ?? 0} 个群组）`;
      setSyncInfo(info);
      setSyncStatus('done');
      await load();
      setTimeout(() => setSyncStatus('idle'), 4000);
    } catch (err) {
      setSyncInfo(`同步失败：${String(err)}`);
      setSyncStatus('error');
    }
  }, [load]);

  /** Trigger AI analysis for a single contact, reload after */
  const analyzeContact = useCallback(async (contactId: string) => {
    setAiStatus('analyzing');
    setAiInfo(null);
    try {
      const result = await api.ai.analyze(contactId);
      if (result.success) {
        const info = `AI 分析完成：识别 ${result.events ?? 0} 个事件，${result.topics ?? 0} 个新主题`;
        setAiInfo(info);
        setAiStatus('done');
        await load();
        setTimeout(() => setAiStatus('idle'), 5000);
      } else {
        setAiInfo(`AI 分析失败：${result.error ?? '未知错误'}`);
        setAiStatus('error');
      }
    } catch (err) {
      setAiInfo(`AI 分析失败：${String(err)}`);
      setAiStatus('error');
    }
  }, [load]);

  /** Trigger AI analysis for all chats, reload after */
  const analyzeAll = useCallback(async () => {
    setAiStatus('analyzing');
    setAiInfo(null);
    try {
      const result = await api.ai.analyzeAll();
      if (result.success) {
        const info = `AI 批量分析完成：处理 ${result.processed} 个会话`;
        setAiInfo(info);
        setAiStatus('done');
        await load();
        setTimeout(() => setAiStatus('idle'), 5000);
      } else {
        setAiInfo('AI 批量分析失败');
        setAiStatus('error');
      }
    } catch (err) {
      setAiInfo(`AI 批量分析失败：${String(err)}`);
      setAiStatus('error');
    }
  }, [load]);

  const addTopic = useCallback(async (name: string) => {
    const usedColors = topics.map(t => parseInt(t.color));
    const availableColor = topicColors.findIndex((_, i) => !usedColors.includes(i));
    const colorIndex = (availableColor >= 0 ? availableColor : topics.length % topicColors.length).toString();
    // Optimistic insert
    const temp: Topic = {
      id: `temp_${Date.now()}`,
      topic_id: `temp_${Date.now()}`,
      name,
      color: colorIndex,
      visible: true,
    };
    setTopics(prev => [...prev, temp]);
    try {
      const created = await api.topics.create(name, colorIndex);
      setTopics(prev => prev.map(t => t.id === temp.id ? created : t));
    } catch {
      setTopics(prev => prev.filter(t => t.id !== temp.id));
    }
  }, [topics]);

  const deleteTopic = useCallback(async (topicId: string) => {
    // topicId here is Topic.id (numeric string from DB row id)
    // We need topic_id for API calls
    const topic = topics.find(t => t.id === topicId);
    setTopics(prev => prev.filter(t => t.id !== topicId));
    try {
      await api.topics.remove(topic?.topic_id ?? topicId);
    } catch {
      load();
    }
  }, [topics, load]);

  /** 写入 timeline_hidden；刷新后该条从时间轴列表消失，可在「事件」页恢复 */
  const hideEventFromTimeline = useCallback(async (eventId: string) => {
    try {
      await api.events.update(eventId, {
        timeline_hidden: true,
        skip_topic_auto_classify: true,
      });
      await load();
    } catch (err) {
      console.error('[useTimeline] hideEventFromTimeline', err);
      alert(`从时间轴隐藏失败：${String(err)}`);
    }
  }, [load]);

  const toggleTopicVisibility = useCallback(async (topicId: string) => {
    // topicId = Topic.id (numeric row id from backend)
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    // Optimistic update
    setTopics(prev => prev.map(t =>
      t.id === topicId ? { ...t, visible: !t.visible } : t
    ));
    try {
      // API uses topic_id (the text slug like "topic1")
      await api.topics.toggle(topic.topic_id, !topic.visible);
    } catch {
      // Rollback
      setTopics(prev => prev.map(t =>
        t.id === topicId ? { ...t, visible: topic.visible } : t
      ));
    }
  }, [topics]);

  // 主列表与「事件」页同源：不按主题可见性、不按 timeline_hidden 过滤（隐藏仅作展示弱化，见时间轴 UI）

  return {
    topics,
    events,
    loading,
    syncStatus,
    syncInfo,
    aiStatus,
    aiInfo,
    addTopic,
    deleteTopic,
    toggleTopicVisibility,
    refresh: load,
    hideEventFromTimeline,
    syncMessages,
    analyzeContact,
    analyzeAll,
  };
}
