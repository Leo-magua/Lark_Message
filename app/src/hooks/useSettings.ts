import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { mockSettings } from '@/data/mock';
import type { Settings } from '@/types';

type Status = 'loading' | 'ready' | 'saving' | 'error';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(mockSettings);
  const [status, setStatus] = useState<Status>('loading');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.settings.get()
      .then(data => {
        if (!cancelled) { setSettings(data); setStatus('ready'); }
      })
      .catch(() => {
        if (!cancelled) { setStatus('error'); }
      });
    return () => { cancelled = true; };
  }, []);

  const saveSettings = useCallback(async () => {
    setStatus('saving');
    try {
      const updated = await api.settings.save(settings);
      setSettings(updated);
      setStatus('ready');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setStatus('error');
    }
  }, [settings]);

  return { settings, setSettings, status, saved, saveSettings };
}
