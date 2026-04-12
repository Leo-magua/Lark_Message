import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Person } from '@/types';

type Status = 'idle' | 'loading' | 'error' | 'ready';

export interface UseContactsReturn {
  contacts: Person[];
  status: Status;
  searchResults: Person[];
  searchLoading: boolean;
  searchLark: (q: string, type: 'person' | 'group') => Promise<void>;
  addContact: (contact: {
    id: string;
    name: string;
    avatar: string;
    title?: string;
    contact_type: 'person' | 'group';
  }) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
}

export function useContacts(): UseContactsReturn {
  const [contacts, setContacts] = useState<Person[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadContacts = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await api.contacts.list();
      setContacts(data.contacts);
      setStatus('ready');
    } catch {
      console.warn('[useContacts] Backend unavailable');
      setStatus('error');
    }
  }, []);

  // Load DB contacts on mount
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const searchLark = useCallback(async (q: string, type: 'person' | 'group') => {
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const data = await api.contacts.search(q, type);
      setSearchResults(data.contacts);
    } catch (err) {
      console.error('[useContacts] search error:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const addContact = useCallback(async (contact: {
    id: string;
    name: string;
    avatar: string;
    title?: string;
    contact_type: 'person' | 'group';
  }) => {
    await api.contacts.add(contact);
    // Refresh list after adding
    await loadContacts();
  }, [loadContacts]);

  const removeContact = useCallback(async (id: string) => {
    await api.contacts.remove(id);
    // Optimistic update
    setContacts(prev => prev.filter(c => c.id !== id));
  }, []);

  return {
    contacts,
    status,
    searchResults,
    searchLoading,
    searchLark,
    addContact,
    removeContact,
  };
}
