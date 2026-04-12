import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { mockChannels } from '@/data/mock';
import type { Channel } from '@/types';

type Status = 'loading' | 'ready' | 'error';

export function useChats() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await api.chats.list();
      setChannels(data);
      setStatus('ready');
    } catch {
      // Graceful fallback to mock data when server is offline
      console.warn('[useChats] Backend unavailable, falling back to mock data');
      setChannels(mockChannels);
      setError('无法连接后端，显示示例数据');
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAutoReply = useCallback(async (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;
    // Optimistic update
    setChannels(prev => prev.map(c =>
      c.id === channelId ? { ...c, autoReply: !c.autoReply } : c
    ));
    try {
      const updated = await api.chats.update(channelId, { autoReply: !channel.autoReply });
      setChannels(prev => prev.map(c => c.id === channelId ? updated : c));
    } catch {
      // Revert on failure
      setChannels(prev => prev.map(c =>
        c.id === channelId ? { ...c, autoReply: channel.autoReply } : c
      ));
    }
  }, [channels]);

  const toggleMonitoring = useCallback(async (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;
    setChannels(prev => prev.map(c =>
      c.id === channelId ? { ...c, isMonitoring: !c.isMonitoring } : c
    ));
    try {
      const updated = await api.chats.update(channelId, { isMonitoring: !channel.isMonitoring });
      setChannels(prev => prev.map(c => c.id === channelId ? updated : c));
    } catch {
      setChannels(prev => prev.map(c =>
        c.id === channelId ? { ...c, isMonitoring: channel.isMonitoring } : c
      ));
    }
  }, [channels]);

  const syncChats = useCallback(async () => {
    setStatus('loading');
    try {
      await api.chats.sync();
      await load();
    } catch (err) {
      setError(`同步失败: ${String(err)}`);
      setStatus('error');
    }
  }, [load]);

  return { channels, setChannels, status, error, toggleAutoReply, toggleMonitoring, syncChats };
}
