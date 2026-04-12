import { useState, useEffect } from 'react';
import {
  Bot,
  Clock,
  Users,
  Settings,
  MessageCircle,
  ChevronRight,
  X,
  Key,
  Terminal,
  Save,
  Search,
  Plus,
  Zap,
  Power,
  ChevronDown,
  ChevronUp,
  Eye,
  AlertCircle,
  EyeOff,
  Tag,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { topicColors } from '@/types';
import type { Person } from '@/types';
import { useContacts } from '@/hooks/useContacts';
import { useChats } from '@/hooks/useChats';
import { useSettings } from '@/hooks/useSettings';
import { useTimeline } from '@/hooks/useTimeline';
import { api } from '@/lib/api';

type Tab = 'status' | 'timeline' | 'contacts' | 'settings';

function formatEventTime(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1440) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (diffMin < 2880) return '昨天';
  const diffD = Math.floor(diffMin / 1440);
  if (diffD < 7) return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  return d.toLocaleDateString('zh-CN');
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const [alertExpanded, setAlertExpanded] = useState(true);
  const [autoReplyExpanded, setAutoReplyExpanded] = useState(true);

  // Real data hooks
  const { channels, toggleAutoReply } = useChats();
  const { settings, setSettings, status: settingsStatus, saved: settingsSaved, saveSettings } = useSettings();
  const {
    topics, events: _events, visibleEvents,
    addTopic: addTopicApi, deleteTopic, toggleTopicVisibility,
    syncStatus: msgSyncStatus, syncInfo: msgSyncInfo, syncMessages,
    analyzeAll, aiStatus, aiInfo,
  } = useTimeline();

  // Contacts — real data from Feishu via backend
  const {
    contacts,
    status: contactsStatus,
    searchResults,
    searchLoading,
    searchLark,
    addContact,
    removeContact,
  } = useContacts();

  // Modals
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');

  // Add Contact modal state
  const [showAddContact, setShowAddContact] = useState(false);
  const [addContactType, setAddContactType] = useState<'person' | 'group'>('person');
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Contact detail modal
  const [selectedContact, setSelectedContact] = useState<Person | null>(null);

  const monitoringChannels = channels.filter(c => c.isMonitoring);
  const autoReplyChannels = channels.filter(c => c.autoReply);
  const alertChannels = monitoringChannels.filter(c => c.hasAlert);

  // Topic operations
  const addTopic = () => {
    if (!newTopicName.trim()) return;
    addTopicApi(newTopicName);
    setNewTopicName('');
    setShowAddTopic(false);
  };

  // ============ Status Page ============
  const StatusPage = () => (
    <div className="space-y-4">
      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3 border border-neutral-200">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] text-neutral-500">运行中</span>
          </div>
          <p className="text-xl font-bold text-neutral-900">{autoReplyChannels.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-neutral-200">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Eye className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] text-neutral-500">关注</span>
          </div>
          <p className="text-xl font-bold text-neutral-900">{alertChannels.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-neutral-200">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Tag className="w-3 h-3 text-blue-500" />
            <span className="text-[10px] text-neutral-500">主题</span>
          </div>
          <p className="text-xl font-bold text-neutral-900">{topics.filter(t => t.visible).length}/{topics.length}</p>
        </div>
      </div>

      {/* Alert Section */}
      {alertChannels.length > 0 && (
        <div>
          <button 
            onClick={() => setAlertExpanded(!alertExpanded)}
            className="w-full flex items-center justify-between py-3 hover:opacity-70 transition-opacity"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="font-medium text-red-600">需关注</span>
              <span className="text-xs text-red-400">({alertChannels.length})</span>
            </div>
            {alertExpanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
          </button>
          {alertExpanded && (
            <div className="mt-2 space-y-2">
              {alertChannels.map((channel) => (
                <div key={channel.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-neutral-900">{channel.name}</span>
                    <p className="text-sm text-neutral-500 truncate">{channel.summary}</p>
                  </div>
                  <span className="text-xs text-neutral-400 flex-shrink-0">{channel.lastActive}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto Reply Channels */}
      <div>
        <button 
          onClick={() => setAutoReplyExpanded(!autoReplyExpanded)}
          className="w-full flex items-center justify-between py-3 hover:opacity-70 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-neutral-500" />
            <span className="font-medium text-neutral-900">自动回复通道</span>
            <span className="text-xs text-neutral-500">({monitoringChannels.length})</span>
          </div>
          {autoReplyExpanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </button>
        {autoReplyExpanded && (
          <div className="mt-2 space-y-2">
            {monitoringChannels.map((channel) => (
              <div key={channel.id} className="flex items-center gap-3 p-3 bg-neutral-100 rounded-xl">
                {channel.type === 'person' && channel.avatar ? (
                  <img src={channel.avatar} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-5 h-5 text-neutral-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900 truncate">{channel.name}</span>
                    {channel.hasAlert && <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-neutral-500 truncate">{channel.summary}</p>
                </div>
                <button
                  onClick={() => toggleAutoReply(channel.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
                    channel.autoReply ? 'bg-green-500 text-white' : 'bg-white text-neutral-500'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  {channel.autoReply ? '开启' : '关闭'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ============ Timeline Page ============
  const TimelinePage = () => {
    return (
      <div className="space-y-4">
        {/* Header with Topic Filter */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-neutral-500">时间轴</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              {visibleEvents.length} 条事件
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => analyzeAll()}
              disabled={aiStatus === 'analyzing' || msgSyncStatus === 'syncing'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-full hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {aiStatus === 'analyzing'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Bot className="w-4 h-4" />}
              {aiStatus === 'analyzing' ? 'AI分析中...' : 'AI分析'}
            </button>
            <button
              onClick={() => syncMessages()}
              disabled={msgSyncStatus === 'syncing'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {msgSyncStatus === 'syncing'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              {msgSyncStatus === 'syncing' ? '同步中...' : '同步消息'}
            </button>
            <button
              onClick={() => setShowAddTopic(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white text-sm rounded-full hover:bg-neutral-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              主题
            </button>
          </div>
        </div>

        {/* AI status bar */}
        {aiInfo && (
          <div className={`text-xs px-3 py-2 rounded-lg ${
            aiStatus === 'error'
              ? 'bg-red-50 text-red-600'
              : 'bg-purple-50 text-purple-700'
          }`}>
            {aiInfo}
          </div>
        )}

        {/* Sync status bar */}
        {msgSyncInfo && (
          <div className={`text-xs px-3 py-2 rounded-lg ${
            msgSyncStatus === 'error'
              ? 'bg-red-50 text-red-600'
              : 'bg-blue-50 text-blue-700'
          }`}>
            {msgSyncInfo}
          </div>
        )}

        {/* Topic Filter Bar */}
        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => {
            const colors = topicColors[parseInt(topic.color)] ?? topicColors[0];
            return (
              <button
                key={topic.id}
                onClick={() => toggleTopicVisibility(topic.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  topic.visible
                    ? `${colors.bg} ${colors.text}`
                    : 'bg-neutral-100 text-neutral-400'
                }`}
              >
                {topic.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {topic.name}
                <span className="opacity-60">
                  ({_events.filter(e => e.topics.includes(topic.topic_id)).length})
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTopic(topic.id);
                  }}
                  className="ml-1 p-0.5 hover:bg-black/10 rounded transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </button>
            );
          })}
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[3.5rem] top-0 bottom-0 w-px bg-neutral-200" />

          <div className="space-y-0">
            {visibleEvents.map((event) => {
              // Find first matching visible topic for coloring
              const matchedTopic = topics.find(t => event.topics.includes(t.topic_id));
              const colors = matchedTopic ? (topicColors[parseInt(matchedTopic.color)] ?? topicColors[0]) : topicColors[0];
              const timeLabel = formatEventTime(event.occurred_at);

              return (
                <div key={event.id} className="relative flex items-start gap-4 py-3">
                  {/* Time */}
                  <div className="w-12 text-right flex-shrink-0">
                    <span className="text-xs text-neutral-500">{timeLabel}</span>
                  </div>

                  {/* Dot */}
                  <div className={`relative z-10 w-3 h-3 rounded-full ${colors.dot} flex-shrink-0 mt-0.5`} />

                  {/* Content */}
                  <div className={`flex-1 p-3 rounded-xl ${colors.bg} border ${colors.border}`}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-semibold ${colors.text}`}>{event.title}</span>
                      {/* Topic tags */}
                      {event.topics.map(tid => {
                        const t = topics.find(tp => tp.topic_id === tid);
                        if (!t) return null;
                        const tc = topicColors[parseInt(t.color)] ?? topicColors[0];
                        return (
                          <span key={tid} className={`text-xs px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
                            {t.name}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-sm text-neutral-700">{event.summary}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {visibleEvents.length === 0 && (
            <div className="text-center py-12 text-neutral-400">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无事件</p>
              <p className="text-xs mt-1">请先同步消息并触发 AI 分析</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============ Add Topic Modal ============
  const AddTopicModal = () => {
    if (!showAddTopic) return null;
    return (
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={() => setShowAddTopic(false)}
      >
        <div 
          className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-neutral-900">新建主题</h3>
            <button onClick={() => setShowAddTopic(false)} className="p-1 hover:bg-neutral-100 rounded-lg">
              <X className="w-5 h-5 text-neutral-400" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-neutral-500 mb-1.5 block">主题名称</label>
              <input
                type="text"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                placeholder="如：Q2产品迭代"
                className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400"
                onKeyDown={(e) => e.key === 'Enter' && addTopic()}
              />
            </div>
            <button
              onClick={addTopic}
              disabled={!newTopicName.trim()}
              className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white py-3 rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              创建主题
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============ Contacts Page ============
  const ContactsPage = () => {
    // Debounce ref for search input in add dialog
    const debounceRef = { current: 0 as ReturnType<typeof setTimeout> };

    // Summary drawer state
    const [summaryData, setSummaryData] = useState<{
      messages: Array<{ sender: string; content: string; time: string }>;
      last_message_at: string;
    } | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const [syncingContact, setSyncingContact] = useState(false);
    const [analyzingContact, setAnalyzingContact] = useState(false);
    const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

    // Load summary when selectedContact changes
    useEffect(() => {
      if (!selectedContact) {
        setSummaryData(null);
        setSummaryError(null);
        setAnalyzeMsg(null);
        return;
      }
      setSummaryLoading(true);
      setSummaryData(null);
      setSummaryError(null);
      setAnalyzeMsg(null);
      api.contacts.summary(selectedContact.id)
        .then(data => {
          setSummaryData({ messages: data.messages, last_message_at: data.last_message_at });
        })
        .catch(err => {
          setSummaryError(String(err));
        })
        .finally(() => setSummaryLoading(false));
    }, [selectedContact?.id]);

    const handleSyncContact = async () => {
      if (!selectedContact) return;
      setSyncingContact(true);
      try {
        await api.messages.syncContact(selectedContact.id);
        // Reload summary after sync
        const data = await api.contacts.summary(selectedContact.id);
        setSummaryData({ messages: data.messages, last_message_at: data.last_message_at });
      } catch (err) {
        setSummaryError('同步失败: ' + String(err));
      } finally {
        setSyncingContact(false);
      }
    };

    const handleAnalyzeContact = async () => {
      if (!selectedContact) return;
      setAnalyzingContact(true);
      setAnalyzeMsg(null);
      try {
        await api.ai.analyze(selectedContact.id);
        setAnalyzeMsg('分析完成，请查看时间轴');
      } catch (err) {
        setAnalyzeMsg('分析失败: ' + String(err));
      } finally {
        setAnalyzingContact(false);
      }
    };

    const handleSearchInput = (val: string) => {
      setAddSearchQuery(val);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        searchLark(val, addContactType);
      }, 500);
    };

    const handleTypeChange = (type: 'person' | 'group') => {
      setAddContactType(type);
      setAddSearchQuery('');
      if (type === 'group') {
        searchLark('', 'group');
      }
    };

    const handleAdd = async (c: Person) => {
      await addContact({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        title: c.title,
        contact_type: c.contact_type,
      });
      setAddedIds(prev => new Set([...prev, c.id]));
    };

    const personContacts = contacts.filter(c => c.contact_type === 'person');
    const groupContacts = contacts.filter(c => c.contact_type === 'group');

    function formatMsgTime(isoStr: string): string {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">通讯录</h2>
          <button
            onClick={() => {
              setShowAddContact(true);
              setAddedIds(new Set());
              setAddSearchQuery('');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white text-sm rounded-full hover:bg-neutral-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加
          </button>
        </div>

        {/* Loading */}
        {contactsStatus === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>加载中...</span>
          </div>
        )}

        {/* Person contacts group */}
        {personContacts.length > 0 && (
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-2">联系人</p>
            <div className="space-y-2">
              {personContacts.map((person) => (
                <div
                  key={person.id}
                  className="relative bg-white rounded-xl p-4 border border-neutral-200 hover:border-neutral-300 transition-all"
                >
                  <button
                    onClick={() => setSelectedContact(person)}
                    className="w-full text-left flex items-center gap-3"
                  >
                    {person.avatar
                      ? <img src={person.avatar} alt="" className="w-12 h-12 rounded-full bg-neutral-100 flex-shrink-0" />
                      : <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0">
                          <Users className="w-6 h-6 text-neutral-400" />
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-neutral-900">{person.name}</span>
                      {person.title && (
                        <p className="text-xs text-neutral-400 mt-0.5">{person.title}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                  </button>
                  <button
                    onClick={() => removeContact(person.id)}
                    className="absolute top-2 right-2 p-1 text-neutral-300 hover:text-red-400 transition-colors rounded-full hover:bg-red-50"
                    title="删除"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Group chats group */}
        {groupContacts.length > 0 && (
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-2">群聊</p>
            <div className="space-y-2">
              {groupContacts.map((group) => (
                <div
                  key={group.id}
                  className="relative bg-white rounded-xl p-4 border border-neutral-200 hover:border-neutral-300 transition-all"
                >
                  <button
                    onClick={() => setSelectedContact(group)}
                    className="w-full text-left flex items-center gap-3"
                  >
                    {group.avatar
                      ? <img src={group.avatar} alt="" className="w-12 h-12 rounded-xl bg-neutral-100 flex-shrink-0" />
                      : <div className="w-12 h-12 rounded-xl bg-neutral-200 flex items-center justify-center flex-shrink-0">
                          <MessageCircle className="w-6 h-6 text-neutral-400" />
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-neutral-900">{group.name}</span>
                      {group.member_count !== undefined && (
                        <p className="text-xs text-neutral-400 mt-0.5">{group.member_count} 名成员</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                  </button>
                  <button
                    onClick={() => removeContact(group.id)}
                    className="absolute top-2 right-2 p-1 text-neutral-300 hover:text-red-400 transition-colors rounded-full hover:bg-red-50"
                    title="删除"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {contactsStatus === 'ready' && contacts.length === 0 && (
          <div className="text-center py-12 text-neutral-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">通讯录为空</p>
            <p className="text-xs mt-1">点击右上角加号搜索并添加联系人</p>
          </div>
        )}

        {/* Add Contact Dialog */}
        {showAddContact && (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddContact(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl flex flex-col max-h-[80vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Dialog header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">添加到通讯录</h3>
                <button onClick={() => setShowAddContact(false)} className="p-1 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5 text-neutral-400" />
                </button>
              </div>

              {/* Type tabs */}
              <div className="flex gap-2 mb-4">
                {(['person', 'group'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => handleTypeChange(t)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      addContactType === t
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                    }`}
                  >
                    {t === 'person' ? '联系人' : '群聊'}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  value={addSearchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder={addContactType === 'person' ? '搜索姓名...' : '过滤群名称...'}
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400"
                />
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto space-y-2 min-h-[100px]">
                {searchLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                  </div>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="text-center py-8 text-neutral-400 text-sm">
                    {addContactType === 'group' ? '输入群名称过滤' : '输入姓名搜索'}
                  </div>
                )}
                {searchResults.map((c) => {
                  const alreadyAdded = addedIds.has(c.id) || contacts.some(e => e.id === c.id);
                  return (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-50">
                      {c.avatar
                        ? <img src={c.avatar} alt="" className={`w-10 h-10 bg-neutral-100 flex-shrink-0 ${c.contact_type === 'group' ? 'rounded-xl' : 'rounded-full'}`} />
                        : <div className={`w-10 h-10 bg-neutral-200 flex items-center justify-center flex-shrink-0 ${c.contact_type === 'group' ? 'rounded-xl' : 'rounded-full'}`}>
                            {c.contact_type === 'group'
                              ? <MessageCircle className="w-5 h-5 text-neutral-400" />
                              : <Users className="w-5 h-5 text-neutral-400" />
                            }
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-neutral-900 text-sm truncate">{c.name}</p>
                        {c.title && <p className="text-xs text-neutral-400 truncate">{c.title}</p>}
                        {c.member_count !== undefined && (
                          <p className="text-xs text-neutral-400">{c.member_count} 名成员</p>
                        )}
                      </div>
                      <button
                        disabled={alreadyAdded}
                        onClick={() => handleAdd(c)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
                          alreadyAdded
                            ? 'bg-neutral-100 text-neutral-400 cursor-default'
                            : 'bg-neutral-900 text-white hover:bg-neutral-700'
                        }`}
                      >
                        {alreadyAdded ? '已添加' : '添加'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Contact detail modal — richer version with message summary */}
        {selectedContact && (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setSelectedContact(null)}
          >
            <div
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 shadow-xl flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4 flex-shrink-0">
                <div className="flex items-center gap-4">
                  {selectedContact.avatar
                    ? <img src={selectedContact.avatar} alt="" className={`w-14 h-14 bg-neutral-100 flex-shrink-0 ${selectedContact.contact_type === 'group' ? 'rounded-xl' : 'rounded-full'}`} />
                    : <div className={`w-14 h-14 bg-neutral-200 flex items-center justify-center flex-shrink-0 ${selectedContact.contact_type === 'group' ? 'rounded-xl' : 'rounded-full'}`}>
                        {selectedContact.contact_type === 'group'
                          ? <MessageCircle className="w-7 h-7 text-neutral-400" />
                          : <Users className="w-7 h-7 text-neutral-400" />
                        }
                      </div>
                  }
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900">{selectedContact.name}</h3>
                    {selectedContact.title && <p className="text-sm text-neutral-500">{selectedContact.title}</p>}
                    <p className="text-xs text-neutral-400 mt-0.5">{selectedContact.contact_type === 'person' ? '联系人' : '群聊'}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedContact(null)} className="p-1.5 hover:bg-neutral-100 rounded-lg flex-shrink-0">
                  <X className="w-5 h-5 text-neutral-400" />
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-4 flex-shrink-0">
                <button
                  onClick={handleSyncContact}
                  disabled={syncingContact}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {syncingContact ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  同步消息
                </button>
                <button
                  onClick={handleAnalyzeContact}
                  disabled={analyzingContact}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {analyzingContact ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                  AI 分析
                </button>
              </div>

              {/* Analyze result message */}
              {analyzeMsg && (
                <div className={`text-xs px-3 py-2 rounded-lg mb-3 flex-shrink-0 ${analyzeMsg.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                  {analyzeMsg}
                </div>
              )}

              {/* Messages section */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <p className="text-xs font-medium text-neutral-500 mb-2 flex-shrink-0">最近消息</p>

                {summaryLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                  </div>
                )}

                {summaryError && !summaryLoading && (
                  <div className="text-xs text-red-500 py-4 text-center">{summaryError}</div>
                )}

                {!summaryLoading && !summaryError && summaryData && summaryData.messages.length === 0 && (
                  <div className="text-xs text-neutral-400 py-8 text-center">暂无消息，点击"同步消息"获取</div>
                )}

                {!summaryLoading && summaryData && summaryData.messages.length > 0 && (
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {summaryData.messages.map((msg, idx) => (
                      <div key={idx} className="p-3 bg-neutral-50 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-neutral-700 truncate max-w-[120px]">{msg.sender}</span>
                          <span className="text-xs text-neutral-400 flex-shrink-0 ml-2">{formatMsgTime(msg.time)}</span>
                        </div>
                        <p className="text-sm text-neutral-600 leading-relaxed line-clamp-3">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============ Settings Page ============
  const SettingsPage = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-4 border border-neutral-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-neutral-900">自动回复</p>
            <p className="text-xs text-neutral-500 mt-0.5">开启后 AI 将自动回复消息</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, autoReplyEnabled: !s.autoReplyEnabled }))}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              settings.autoReplyEnabled ? 'bg-green-500' : 'bg-neutral-300'
            }`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
              settings.autoReplyEnabled ? 'left-[26px]' : 'left-0.5'
            }`} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-neutral-200 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-neutral-400" />
          <h3 className="font-medium text-neutral-900">OpenAI 兼容 API</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">API URL</label>
            <input
              type="text"
              value={settings.openaiUrl}
              onChange={(e) => setSettings(s => ({ ...s, openaiUrl: e.target.value }))}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">API Key</label>
            <input
              type="password"
              value={settings.openaiKey}
              onChange={(e) => setSettings(s => ({ ...s, openaiKey: e.target.value }))}
              placeholder="sk-..."
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">模型名称 (Model ID)</label>
            <input
              type="text"
              value={settings.modelId}
              onChange={(e) => setSettings(s => ({ ...s, modelId: e.target.value }))}
              placeholder="例如：step-3.5-flash-2603 / gpt-4o / deepseek-chat"
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-neutral-200 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-neutral-400" />
          <h3 className="font-medium text-neutral-900">Kimi CLI 指令</h3>
        </div>
        <textarea
          value={settings.kimiCommand}
          onChange={(e) => setSettings(s => ({ ...s, kimiCommand: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400 resize-none"
        />
        <p className="text-xs text-neutral-400">分析对话时发送给 Kimi 的默认指令</p>
      </div>

      <button
        onClick={saveSettings}
        disabled={settingsStatus === 'saving'}
        className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white py-3 rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-60"
      >
        {settingsStatus === 'saving' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        {settingsSaved ? '已保存 ✓' : '保存设置'}
      </button>
    </div>
  );

  const tabs: { id: Tab; label: string; icon: typeof Bot }[] = [
    { id: 'status', label: '状态', icon: Bot },
    { id: 'timeline', label: '时间轴', icon: Clock },
    { id: 'contacts', label: '通讯录', icon: Users },
    { id: 'settings', label: '设置', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-neutral-200 sticky top-0 h-screen">
        <div className="p-6 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-neutral-900">消息盒子</h1>
              <p className="text-xs text-neutral-500">AI 自动回复助手</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                activeTab === tab.id 
                  ? 'bg-neutral-900 text-white' 
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="font-medium">{tab.label}</span>
              {tab.id === 'status' && alertChannels.length > 0 && (
                <span className="ml-auto w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {alertChannels.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-200">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-neutral-600">我</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">当前用户</p>
              <p className="text-xs text-neutral-500 truncate">在线</p>
            </div>
            <div className="w-2 h-2 bg-green-500 rounded-full" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen pb-20 lg:pb-0">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white border-b border-neutral-200 px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-semibold text-neutral-900">
              {tabs.find(t => t.id === activeTab)?.label}
            </h1>
            {activeTab === 'status' && alertChannels.length > 0 && (
              <span className="ml-auto w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {alertChannels.length}
              </span>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-8 max-w-3xl">
          {activeTab === 'status' && <StatusPage />}
          {activeTab === 'timeline' && <TimelinePage />}
          {activeTab === 'contacts' && <ContactsPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-2 pb-safe z-20">
        <div className="flex justify-around">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center py-3 px-4 transition-colors ${
                activeTab === tab.id ? 'text-neutral-900' : 'text-neutral-400'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" />
                {tab.id === 'status' && alertChannels.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {alertChannels.length}
                  </span>
                )}
              </div>
              <span className="text-xs mt-1">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Modals */}
      <AddTopicModal />
    </div>
  );
}

export default App;

