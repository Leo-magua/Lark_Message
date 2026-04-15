import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
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
  ToggleLeft,
  ToggleRight,
  Table2,
  Pencil,
  Trash2,
  Timer,
  Sparkles,
  Send,
} from 'lucide-react';
import { topicColors } from '@/types';
import type { Person, Channel, AutoReplyChannel, Template, ManagedEvent, Topic, ContactLinkedEvent, ContactMessage, Settings as SettingsType, TimelineEvent } from '@/types';
import { useContacts } from '@/hooks/useContacts';
import { useChats } from '@/hooks/useChats';
import { useSettings } from '@/hooks/useSettings';
import { useTimeline } from '@/hooks/useTimeline';
import { api } from '@/lib/api';

type Tab = 'status' | 'timeline' | 'events' | 'contacts' | 'settings';

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

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

// ============ StatusPage ============
interface StatusPageProps {
  autoReplyChannels: AutoReplyChannel[];
  loadingAutoReplyChannels: boolean;
  alertChannels: Channel[];
  alertExpanded: boolean;
  setAlertExpanded: Dispatch<SetStateAction<boolean>>;
  loadAutoReplyChannels: () => Promise<void>;
  selectedAutoReplyChannel: AutoReplyChannel | null;
  setSelectedAutoReplyChannel: Dispatch<SetStateAction<AutoReplyChannel | null>>;
  channelPromptDraft: string;
  setChannelPromptDraft: Dispatch<SetStateAction<string>>;
  channelPromptSaving: boolean;
  setChannelPromptSaving: Dispatch<SetStateAction<boolean>>;
  channelPromptHint: string | null;
  setChannelPromptHint: Dispatch<SetStateAction<string | null>>;
  handleToggleStatusChannel: (channelId: string) => Promise<void>;
  handleToggleAutoReplyChannelMode: (channel: AutoReplyChannel) => Promise<void>;
  topics: Topic[];
}

function StatusPage({
  autoReplyChannels,
  loadingAutoReplyChannels,
  alertChannels,
  alertExpanded,
  setAlertExpanded,
  loadAutoReplyChannels,
  selectedAutoReplyChannel,
  setSelectedAutoReplyChannel,
  channelPromptDraft,
  setChannelPromptDraft,
  channelPromptSaving,
  setChannelPromptSaving,
  channelPromptHint,
  setChannelPromptHint,
  handleToggleStatusChannel,
  handleToggleAutoReplyChannelMode,
  topics,
}: StatusPageProps) {
  const [autoReplyModeEnabled, setAutoReplyModeEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoReplyModeEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleToggleAutoReplyMode = () => {
    const newValue = !autoReplyModeEnabled;
    setAutoReplyModeEnabled(newValue);
    localStorage.setItem('autoReplyModeEnabled', JSON.stringify(newValue));
    console.log('全局自动回复模式切换为：', newValue ? '开启' : '关闭');
  };

  const [testPreviewLoading, setTestPreviewLoading] = useState(false);
  const [testSendLoading, setTestSendLoading] = useState(false);
  const [testReplyText, setTestReplyText] = useState<string | null>(null);
  const [testReplyError, setTestReplyError] = useState<string | null>(null);
  const [testReplySent, setTestReplySent] = useState(false);
  const [testSendError, setTestSendError] = useState<string | null>(null);
  const [manualSendText, setManualSendText] = useState('');
  const [manualSendLoading, setManualSendLoading] = useState(false);
  const [manualSendResult, setManualSendResult] = useState<string | null>(null);

  useEffect(() => {
    setTestReplyText(null);
    setTestReplyError(null);
    setTestReplySent(false);
    setTestSendError(null);
  }, [selectedAutoReplyChannel?.id]);

  return (
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

      {/* Auto Reply Channels - Always Visible */}
      <div className="space-y-2">
        {/* Header with global toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-neutral-500" />
            <span className="font-medium text-neutral-900">自动回复通道</span>
            <span className="text-xs text-neutral-500">({autoReplyChannels.length})</span>
            {loadingAutoReplyChannels && <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">自动回复模式</span>
            <button
              type="button"
              onClick={handleToggleAutoReplyMode}
              className={`p-1.5 rounded-full transition-colors ${
                autoReplyModeEnabled
                  ? 'bg-green-100 text-green-600 hover:bg-green-200'
                  : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
              }`}
              title={autoReplyModeEnabled ? '关闭自动回复模式' : '开启自动回复模式'}
            >
              {autoReplyModeEnabled ? (
                <ToggleRight className="w-5 h-5" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Channel Cards */}
        {autoReplyChannels.map((channel) => (
          <div
            key={channel.id}
            className={`relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
              channel.enabled
                ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                : 'bg-neutral-100 border border-transparent hover:bg-neutral-200'
            }`}
            onClick={() => {
              setSelectedAutoReplyChannel(channel);
              setChannelPromptDraft(channel.config?.systemPrompt ?? '');
              setChannelPromptHint(null);
            }}
          >
            {channel.type === 'person' && channel.avatar ? (
              <img src={channel.avatar} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-neutral-400" />
              </div>
            )}
            <div className="flex-1 min-w-0 pr-20">
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-900 truncate">{channel.name}</span>
              </div>
              <p className="text-xs text-neutral-500 truncate">{channel.summary}</p>
            </div>
            <div className="absolute right-10 top-1/2 flex -translate-y-1/2 items-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleToggleAutoReplyChannelMode(channel);
                }}
                className={`p-1.5 rounded-full transition-colors ${
                  channel.enabled
                    ? 'bg-green-100 text-green-600 hover:bg-green-200'
                    : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                }`}
                title={channel.enabled ? '关闭该通道自动回复模式' : '开启该通道自动回复模式'}
              >
                {channel.enabled ? (
                  <ToggleRight className="w-5 h-5" />
                ) : (
                  <ToggleLeft className="w-5 h-5" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleToggleStatusChannel(channel.id);
              }}
              className="absolute top-2 right-2 p-1 text-neutral-300 hover:text-red-400 transition-colors rounded-full hover:bg-red-50"
              title="关闭自动回复（移出通道）"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Auto-reply Channel Detail Modal */}
      {selectedAutoReplyChannel && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedAutoReplyChannel(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {selectedAutoReplyChannel.type === 'person' && selectedAutoReplyChannel.avatar ? (
                  <img src={selectedAutoReplyChannel.avatar} alt="" className="w-12 h-12 rounded-full" />
                ) : (
                  <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-neutral-400" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900">{selectedAutoReplyChannel.name}</h3>
                  <p className="text-xs text-neutral-500">{selectedAutoReplyChannel.type === 'person' ? '联系人' : '群聊'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedAutoReplyChannel(null)} className="p-1 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Current Status */}
              <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-neutral-900">自动回复状态</p>
                  <p className="text-xs text-neutral-500 mt-0.5">当前状态：{selectedAutoReplyChannel.autoReply ? '已开启' : '已关闭'}</p>
                </div>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!selectedAutoReplyChannel) return;
                    try {
                      await api.autoReply.toggle(selectedAutoReplyChannel.id);
                      setSelectedAutoReplyChannel(prev => prev ? { ...prev, autoReply: !prev.autoReply } : null);
                      await loadAutoReplyChannels();
                    } catch (err) {
                      alert('操作失败: ' + err);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedAutoReplyChannel.autoReply
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-white text-neutral-500 hover:bg-neutral-100'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  {selectedAutoReplyChannel.autoReply ? '关闭' : '开启'}
                </button>
              </div>

              {/* Per-channel system prompt editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-neutral-900">Channel 专属提示词</p>
                  {channelPromptHint && (
                    <span className="text-xs text-neutral-500">{channelPromptHint}</span>
                  )}
                </div>
                <textarea
                  value={channelPromptDraft}
                  onChange={e => setChannelPromptDraft(e.target.value)}
                  rows={4}
                  placeholder="留空则使用全局自动回复提示词；填写后此 channel 将使用独立提示词覆盖全局设置。"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400 resize-none"
                />
                <p className="text-[11px] text-neutral-400">
                  优先级：Channel 专属提示词 &gt; 模板提示词 &gt; 全局自动回复提示词
                </p>
                <button
                  type="button"
                  disabled={channelPromptSaving}
                  onClick={async () => {
                    if (!selectedAutoReplyChannel) return;
                    setChannelPromptSaving(true);
                    setChannelPromptHint(null);
                    try {
                      await api.autoReply.setConfig(
                        selectedAutoReplyChannel.type as 'person' | 'group',
                        selectedAutoReplyChannel.id,
                        {
                          templateId: selectedAutoReplyChannel.config?.templateId ?? null,
                          knowledgeTags: selectedAutoReplyChannel.config?.knowledgeTags ?? [],
                          customContext: selectedAutoReplyChannel.config?.customContext ?? '',
                          systemPrompt: channelPromptDraft,
                          enabled: selectedAutoReplyChannel.enabled,
                        }
                      );
                      setChannelPromptHint('已保存');
                      setTimeout(() => setChannelPromptHint(null), 2000);
                      await loadAutoReplyChannels();
                    } catch (err) {
                      setChannelPromptHint('保存失败：' + String(err));
                    } finally {
                      setChannelPromptSaving(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-neutral-900 text-white text-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                >
                  {channelPromptSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存提示词
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={testPreviewLoading || testSendLoading}
                    onClick={async () => {
                      if (!selectedAutoReplyChannel) return;
                      setTestPreviewLoading(true);
                      setTestReplyError(null);
                      setTestReplyText(null);
                      setTestReplySent(false);
                      setTestSendError(null);
                      try {
                        const r = await api.autoReply.test(
                          selectedAutoReplyChannel.type as 'person' | 'group',
                          selectedAutoReplyChannel.id,
                          { limit: 30, systemPromptDraft: channelPromptDraft, send: false }
                        );
                        if (!r.success || r.reply == null) {
                          setTestReplyError(r.error ?? '生成失败');
                          return;
                        }
                        setTestReplyText(r.reply);
                        setTestReplySent(false);
                      } catch (e) {
                        setTestReplyError(String(e));
                      } finally {
                        setTestPreviewLoading(false);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-900 text-sm hover:bg-violet-100 disabled:opacity-50 transition-colors"
                  >
                    {testPreviewLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    仅预览
                  </button>
                  <button
                    type="button"
                    disabled={testPreviewLoading || testSendLoading}
                    onClick={async () => {
                      if (!selectedAutoReplyChannel) return;
                      setTestSendLoading(true);
                      setTestReplyError(null);
                      setTestReplyText(null);
                      setTestReplySent(false);
                      setTestSendError(null);
                      try {
                        const r = await api.autoReply.test(
                          selectedAutoReplyChannel.type as 'person' | 'group',
                          selectedAutoReplyChannel.id,
                          { limit: 30, systemPromptDraft: channelPromptDraft, send: true }
                        );
                        if (!r.success || r.reply == null) {
                          setTestReplyError(r.error ?? '生成失败');
                          return;
                        }
                        setTestReplyText(r.reply);
                        setTestReplySent(Boolean(r.sent));
                        if (r.sendError) setTestSendError(r.sendError);
                      } catch (e) {
                        setTestReplyError(String(e));
                      } finally {
                        setTestSendLoading(false);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 text-sm hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                  >
                    {testSendLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    AI生成并发送
                  </button>
                </div>
                <p className="text-[11px] text-neutral-400">
                  使用上方提示词草稿与本地最近 30 条消息生成回复。「AI生成并发送」通过 lark-cli 以机器人身份发送到飞书，不写自动回复已读标记。
                </p>
                {testReplyError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{testReplyError}</div>
                ) : null}
                {testSendError ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    内容已生成，但发送到飞书失败：{testSendError}
                  </div>
                ) : null}
                {testReplyText ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-xs font-medium text-neutral-500 mb-1">
                      {testReplySent ? '已发送到飞书' : testSendError ? '回复正文（发送未成功）' : '预览（未发送）'}
                    </p>
                    <p className="text-sm text-neutral-900 whitespace-pre-wrap leading-relaxed">{testReplyText}</p>
                  </div>
                ) : null}

                {/* Manual send input */}
                <div className="border-t border-neutral-100 pt-3 space-y-2">
                  <p className="text-xs font-medium text-neutral-500">手动发送（直接填写内容发到飞书，不经过 AI）</p>
                  <div className="flex gap-2">
                    <textarea
                      value={manualSendText}
                      onChange={(e) => { setManualSendText(e.target.value); setManualSendResult(null); }}
                      placeholder="输入要发送的消息内容..."
                      rows={2}
                      className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400 resize-none"
                    />
                    <button
                      type="button"
                      disabled={manualSendLoading || !manualSendText.trim()}
                      onClick={async () => {
                        if (!selectedAutoReplyChannel || !manualSendText.trim()) return;
                        setManualSendLoading(true);
                        setManualSendResult(null);
                        try {
                          const r = await api.autoReply.sendManual(
                            selectedAutoReplyChannel.type as 'person' | 'group',
                            selectedAutoReplyChannel.id,
                            manualSendText.trim()
                          );
                          if (r.success) {
                            setManualSendResult('已发送');
                            setManualSendText('');
                          } else {
                            setManualSendResult('失败：' + (r.error ?? '未知错误'));
                          }
                        } catch (e) {
                          setManualSendResult('失败：' + String(e));
                        } finally {
                          setManualSendLoading(false);
                        }
                      }}
                      className="flex-shrink-0 px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {manualSendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      发送
                    </button>
                  </div>
                  {manualSendResult && (
                    <p className={`text-xs ${manualSendResult === '已发送' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {manualSendResult}
                    </p>
                  )}
                </div>
              </div>

              {/* Config summary (readonly info) */}
              {selectedAutoReplyChannel.config && (selectedAutoReplyChannel.config.knowledgeTags?.length > 0 || selectedAutoReplyChannel.config.customContext) && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-500">其他配置</p>
                  {selectedAutoReplyChannel.config.knowledgeTags && selectedAutoReplyChannel.config.knowledgeTags.length > 0 && (
                    <div className="p-3 bg-neutral-50 rounded-xl">
                      <p className="text-xs text-neutral-500 mb-1">知识标签</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedAutoReplyChannel.config.knowledgeTags.map((tag, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedAutoReplyChannel.config.customContext && (
                    <div className="p-3 bg-neutral-50 rounded-xl">
                      <p className="text-xs text-neutral-500 mb-1">补充上下文</p>
                      <p className="text-sm text-neutral-900 line-clamp-3">{selectedAutoReplyChannel.config.customContext}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ TimelinePage ============
interface TimelinePageProps {
  events: TimelineEvent[];
  topics: Topic[];
  toggleTopicVisibility: (id: string) => void;
  deleteTopic: (id: string) => void;
  hideEventFromTimeline: (id: string) => Promise<void>;
  setShowAddTopic: Dispatch<SetStateAction<boolean>>;
}

function TimelinePage({ events, topics, toggleTopicVisibility, deleteTopic, hideEventFromTimeline, setShowAddTopic }: TimelinePageProps) {
  return (
    <div className="space-y-4">
      {/* Header with Topic Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-neutral-500">时间轴</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            {events.length} 条（未从时间轴隐藏）；事件页含「已隐藏」的完整列表
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddTopic(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white text-sm rounded-full hover:bg-neutral-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            主题
          </button>
        </div>
      </div>

      {/* Topic Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {topics.map((topic) => {
          const colors = topicColors[parseInt(topic.color)] ?? topicColors[0];
          return (
            <div
              key={topic.id}
              role="button"
              tabIndex={0}
              onClick={() => toggleTopicVisibility(topic.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleTopicVisibility(topic.id);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer select-none ${
                topic.visible
                  ? `${colors.bg} ${colors.text}`
                  : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              {topic.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {topic.name}
              <span className="opacity-60">
                ({events.filter(e => e.topics.includes(topic.topic_id)).length})
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTopic(topic.id);
                }}
                className="ml-1 p-0.5 hover:bg-black/10 rounded transition-colors"
                aria-label={`删除主题 ${topic.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[3.5rem] top-0 bottom-0 w-px bg-neutral-200" />

        <div className="space-y-0">
          {events.map((event) => {
            const matchedTopic =
              topics.find(t => event.topics.includes(t.topic_id) && t.visible) ??
              topics.find(t => event.topics.includes(t.topic_id));
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
                <div className={`relative flex-1 p-3 pr-9 rounded-xl ${colors.bg} border ${colors.border}`}>
                  <button
                    type="button"
                    onClick={() => void hideEventFromTimeline(event.id)}
                    className="absolute top-2 right-2 p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-white/60 transition-colors"
                    title="从时间轴隐藏（记录仍在，可在「事件」页勾选「时间轴」恢复）"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
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
                  {event.speaker_highlights?.trim() ? (
                    <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                      <span className="font-medium text-neutral-600">发言要点：</span>
                      {event.speaker_highlights}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {events.length === 0 && (
          <div className="text-center py-12 text-neutral-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无事件</p>
            <p className="text-xs mt-1">请在通讯录中同步消息并触发 AI 分析</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ EventsPage ============
interface EventsPageProps {
  refreshTimeline: () => Promise<void>;
}

function EventsPage({ refreshTimeline }: EventsPageProps) {
  const [rows, setRows] = useState<ManagedEvent[]>([]);
  const [topicOptions, setTopicOptions] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formSpeakerHighlights, setFormSpeakerHighlights] = useState('');
  const [formOccurred, setFormOccurred] = useState('');
  const [formShowOnTimeline, setFormShowOnTimeline] = useState(true);
  const [formTopicIds, setFormTopicIds] = useState<Set<string>>(new Set());

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const [ev, tp] = await Promise.all([
        api.events.list({ limit: 2000, offset: 0 }),
        api.topics.list(),
      ]);
      setRows(ev.events);
      setTopicOptions(tp);
    } catch (e) {
      console.warn('[EventsPage] loadRows failed:', e);
      setRows([]);
      setTopicOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const openCreate = () => {
    setEditingId(null);
    setFormTitle('');
    setFormSummary('');
    setFormSpeakerHighlights('');
    setFormOccurred(toDatetimeLocalValue(new Date().toISOString()));
    setFormShowOnTimeline(true);
    setFormTopicIds(new Set());
    setEditorOpen(true);
  };

  const openEdit = (ev: ManagedEvent) => {
    setEditingId(ev.id);
    setFormTitle(ev.title);
    setFormSummary(ev.summary);
    setFormSpeakerHighlights(ev.speaker_highlights ?? '');
    setFormOccurred(toDatetimeLocalValue(ev.occurred_at));
    setFormShowOnTimeline(!ev.timeline_hidden);
    setFormTopicIds(new Set(ev.topics));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
  };

  const saveEditor = async () => {
    if (!formTitle.trim()) {
      alert('请填写标题');
      return;
    }
    const occurredIso = fromDatetimeLocalValue(formOccurred);
    setBusy(true);
    try {
      const payload = {
        title: formTitle.trim(),
        summary: formSummary.trim(),
        speaker_highlights: formSpeakerHighlights.trim(),
        occurred_at: occurredIso,
        timeline_hidden: !formShowOnTimeline,
        topic_ids: [...formTopicIds],
        skip_topic_auto_classify: true as const,
      };
      if (editingId) await api.events.update(editingId, payload);
      else await api.events.create(payload);
      closeEditor();
      await loadRows();
      await refreshTimeline();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleRowSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === rows.length && rows.length > 0) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  };

  const deleteOne = async (id: string) => {
    if (!confirm('确定从数据库删除该事件？不可恢复。')) return;
    setBusy(true);
    try {
      await api.events.remove(id);
      setSelected(prev => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      await loadRows();
      await refreshTimeline();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 条事件？不可恢复。`)) return;
    setBusy(true);
    try {
      await api.events.bulkRemove([...selected]);
      setSelected(new Set());
      await loadRows();
      await refreshTimeline();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const bulkUnhideFromTimeline = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      for (const id of selected) {
        await api.events.update(id, {
          timeline_hidden: false,
          skip_topic_auto_classify: true,
        });
      }
      setSelected(new Set());
      await loadRows();
      await refreshTimeline();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleTopicPick = (topicId: string) => {
    setFormTopicIds(prev => {
      const n = new Set(prev);
      if (n.has(topicId)) n.delete(topicId);
      else n.add(topicId);
      return n;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-neutral-500">事件管理</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            在此管理全部事件（含已从时间轴隐藏的条目）；时间轴仅展示未隐藏项，「×」写入隐藏标记。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadRows()}
            disabled={loading || busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            type="button"
            onClick={openCreate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            新增
          </button>
          <button
            type="button"
            onClick={() => void bulkUnhideFromTimeline()}
            disabled={busy || selected.size === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
          >
            <Eye className="w-3.5 h-3.5" />
            取消隐藏 ({selected.size})
          </button>
          <button
            type="button"
            onClick={() => void bulkDelete()}
            disabled={busy || selected.size === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            批量删除 ({selected.size})
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500">
              <th className="p-2 w-10">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleSelectAll}
                  className="rounded border-neutral-300"
                />
              </th>
              <th className="p-2">时间轴</th>
              <th className="p-2 min-w-[120px]">标题</th>
              <th className="p-2 min-w-[200px]">摘要</th>
              <th className="p-2 min-w-[160px]">发言要点</th>
              <th className="p-2 whitespace-nowrap">时间</th>
              <th className="p-2 min-w-[140px]">主题</th>
              <th className="p-2 w-24 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-neutral-400">
                  <Loader2 className="w-5 h-5 animate-spin inline-block mr-2 align-middle" />
                  加载中…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-neutral-400 text-sm">暂无事件</td>
              </tr>
            )}
            {!loading &&
              rows.map(ev => (
                <tr key={ev.id} className="border-b border-neutral-100 hover:bg-neutral-50/80">
                  <td className="p-2 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(ev.id)}
                      onChange={() => toggleRowSelect(ev.id)}
                      className="rounded border-neutral-300"
                    />
                  </td>
                  <td className="p-2 align-top text-xs">
                    {ev.timeline_hidden ? (
                      <span className="text-amber-600">已隐藏</span>
                    ) : (
                      <span className="text-green-600">显示</span>
                    )}
                  </td>
                  <td className="p-2 align-top font-medium text-neutral-900 max-w-[200px]">
                    <span className="line-clamp-2">{ev.title}</span>
                  </td>
                  <td className="p-2 align-top text-neutral-600 max-w-xs">
                    <span className="line-clamp-2">{ev.summary || '—'}</span>
                  </td>
                  <td className="p-2 align-top text-xs text-neutral-500 max-w-[200px]">
                    <span className="line-clamp-3">{ev.speaker_highlights?.trim() || '—'}</span>
                  </td>
                  <td className="p-2 align-top text-xs text-neutral-500 whitespace-nowrap">
                    {new Date(ev.occurred_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="p-2 align-top text-xs">
                    <div className="flex flex-wrap gap-1">
                      {ev.topics.length === 0 && <span className="text-neutral-400">—</span>}
                      {ev.topics.map(tid => {
                        const t = topicOptions.find(tp => tp.topic_id === tid);
                        return (
                          <span key={tid} className="px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                            {t?.name ?? tid.slice(0, 8)}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-2 align-top text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(ev)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 inline-flex"
                      title="编辑"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteOne(ev.id)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 inline-flex"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editorOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeEditor}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">
                {editingId ? '编辑事件' : '新增事件'}
              </h3>
              <button type="button" onClick={closeEditor} className="p-1 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">标题</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">摘要</label>
                <textarea
                  value={formSummary}
                  onChange={e => setFormSummary(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">发言要点（谁说了什么 / 观点）</label>
                <textarea
                  value={formSpeakerHighlights}
                  onChange={e => setFormSpeakerHighlights(e.target.value)}
                  rows={2}
                  placeholder="例如：张三：同意下周上线；李四：担心测试时间不够"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">发生时间</label>
                <input
                  type="datetime-local"
                  value={formOccurred}
                  onChange={e => setFormOccurred(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={formShowOnTimeline}
                  onChange={e => setFormShowOnTimeline(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                在时间轴上显示
              </label>
              <div>
                <p className="text-xs text-neutral-500 mb-2">关联主题（多选）</p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-neutral-50 rounded-lg border border-neutral-200">
                  {topicOptions.length === 0 && (
                    <span className="text-xs text-neutral-400">暂无主题，请先在时间轴页创建</span>
                  )}
                  {topicOptions.map(t => (
                    <label key={t.topic_id} className="inline-flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formTopicIds.has(t.topic_id)}
                        onChange={() => toggleTopicPick(t.topic_id)}
                        className="rounded border-neutral-300"
                      />
                      <span>{t.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void saveEditor()}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '保存'}
                </button>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ AddTopicModal ============
interface AddTopicModalProps {
  showAddTopic: boolean;
  setShowAddTopic: Dispatch<SetStateAction<boolean>>;
  newTopicName: string;
  setNewTopicName: Dispatch<SetStateAction<string>>;
  addTopic: () => void;
}

function AddTopicModal({ showAddTopic, setShowAddTopic, newTopicName, setNewTopicName, addTopic }: AddTopicModalProps) {
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
}

// ============ ContactsPage Props ============
interface ContactsPageProps {
  contacts: Person[];
  contactsStatus: 'idle' | 'loading' | 'error' | 'ready';
  searchResults: Person[];
  searchLoading: boolean;
  searchLark: (q: string, type: 'person' | 'group') => Promise<void>;
  clearSearch: () => void;
  addContact: (contact: {
    id: string;
    name: string;
    avatar: string;
    title?: string;
    contact_type: 'person' | 'group';
  }) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  patchContact: (
    id: string,
    data: Partial<Pick<Person, 'tags' | 'knows' | 'lastTalk' | 'talkCount' | 'autoReply' | 'intro'>> & {
      syncMode?: Person['syncMode'] | null;
      syncLimit?: number | null;
    }
  ) => Promise<void>;
  refreshContacts: () => Promise<void>;
  // Modal/UI state
  selectedContact: Person | null;
  setSelectedContact: (p: Person | null) => void;
  showAddContact: boolean;
  setShowAddContact: (b: boolean) => void;
  addContactType: 'person' | 'group';
  setAddContactType: (t: 'person' | 'group') => void;
  addSearchQuery: string;
  setAddSearchQuery: (q: string) => void;
  addedIds: Set<string>;
  setAddedIds: Dispatch<SetStateAction<Set<string>>>;
  // Global sync defaults (from Settings)
  globalDefaultSyncMode: 'latest' | 'full';
  globalDefaultSyncLimit: number;
  globalFullSyncCap: number;
  refreshTimeline: () => Promise<void>;
}

// ============ ContactsPage ============
function ContactsPage(props: ContactsPageProps) {
  const [summaryData, setSummaryData] = useState<{
    messages: ContactMessage[];
    last_message_at: string;
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [syncingContactIds, setSyncingContactIds] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [analyzingContact, setAnalyzingContact] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const [introDraft, setIntroDraft] = useState('');
  const [introAiLoading, setIntroAiLoading] = useState(false);
  const [introHint, setIntroHint] = useState<string | null>(null);
  const [channelEvents, setChannelEvents] = useState<ContactLinkedEvent[]>([]);
  const [channelEventsLoading, setChannelEventsLoading] = useState(false);
  const [channelEventsError, setChannelEventsError] = useState<string | null>(null);

  // Load summary when selectedContact changes
  useEffect(() => {
    if (!props.selectedContact) {
      setSummaryData(null);
      setSummaryError(null);
      setAnalyzeMsg(null);
      setChannelEvents([]);
      setChannelEventsError(null);
      return;
    }
    setSummaryLoading(true);
    setSummaryData(null);
    setSummaryError(null);
    setAnalyzeMsg(null);
    api.contacts.summary(props.selectedContact.id)
      .then(data => {
        setSummaryData({ messages: data.messages, last_message_at: data.last_message_at });
      })
      .catch(err => {
        setSummaryError(String(err));
      })
      .finally(() => setSummaryLoading(false));
  }, [props.selectedContact?.id]);

  useEffect(() => {
    if (!props.selectedContact) {
      setChannelEvents([]);
      setChannelEventsError(null);
      setChannelEventsLoading(false);
      return;
    }
    const id = props.selectedContact.id;
    let cancelled = false;
    setChannelEventsLoading(true);
    setChannelEventsError(null);
    void api.contacts
      .eventsForContact(id)
      .then(r => {
        if (!cancelled) setChannelEvents(r.events);
      })
      .catch(err => {
        if (!cancelled) {
          setChannelEventsError(String(err));
          setChannelEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setChannelEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.selectedContact?.id]);

  const openedIntro = (() => {
    const s = props.selectedContact;
    if (s == null) return '';
    return (props.contacts.find(x => x.id === s.id) ?? s).intro ?? '';
  })();

  useEffect(() => {
    if (!props.selectedContact) {
      setIntroDraft('');
      setIntroHint(null);
      return;
    }
    setIntroDraft(openedIntro);
    setIntroHint(null);
  }, [props.selectedContact?.id, openedIntro]);

  const handleAnalyzeContact = async () => {
    if (!props.selectedContact) return;
    setAnalyzingContact(true);
    setAnalyzeMsg(null);
    try {
      await api.ai.analyze(props.selectedContact.id);
      setAnalyzeMsg('分析完成，请查看时间轴');
      try {
        const r = await api.contacts.eventsForContact(props.selectedContact.id);
        setChannelEvents(r.events);
      } catch {
        /* 事件列表刷新失败不阻断成功提示 */
      }
      await props.refreshTimeline();
      try {
        const sum = await api.contacts.summary(props.selectedContact.id);
        setSummaryData({ messages: sum.messages, last_message_at: sum.last_message_at });
      } catch {
        /* 摘要刷新失败不阻断成功提示 */
      }
    } catch (err) {
      setAnalyzeMsg('分析失败: ' + String(err));
    } finally {
      setAnalyzingContact(false);
    }
  };

  const handleSearchInput = (val: string) => {
    props.setAddSearchQuery(val);
  };

  const runSearch = () => {
    void props.searchLark(props.addSearchQuery, props.addContactType);
  };

  const handleTypeChange = (type: 'person' | 'group') => {
    props.setAddContactType(type);
    props.setAddSearchQuery('');
    props.clearSearch();
  };

  const effectiveSync = (contact: Person) => {
    const mode: 'latest' | 'full' = contact.syncMode ?? props.globalDefaultSyncMode;
    const fullCap = Math.max(1, props.globalFullSyncCap);
    const latestDefault = Math.max(1, props.globalDefaultSyncLimit);

    const latestNRaw = contact.syncLimit;
    const latestN =
      latestNRaw === undefined || latestNRaw === null || Number(latestNRaw) <= 0
        ? latestDefault
        : Math.max(1, Number(latestNRaw));

    const maxMessages = mode === 'full' ? fullCap : latestN;
    return { mode, maxMessages, latestN, fullCap };
  };

  const handleAdd = async (c: Person) => {
    await props.addContact({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      title: c.title,
      contact_type: c.contact_type,
    });
    props.setAddedIds(prev => new Set<string>([...prev, c.id]));
  };

  const handleSyncFromCard = async (contact: Person, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setSyncingContactIds(prev => {
        const next = new Set<string>(prev);
        next.add(contact.id);
        return next;
      });
      const { maxMessages } = effectiveSync(contact);
      const result = contact.contact_type === 'group'
        ? await api.messages.syncChat(contact.id, maxMessages)
        : await api.messages.syncContact(contact.id, maxMessages);

      if (!result.success) {
        alert(`同步未完全成功（已尽力写入数据库）: ${result.error ?? 'unknown error'}`);
      }
      console.log('Synced:', contact.name);
    } catch (err) {
      alert('同步失败: ' + err);
    } finally {
      setSyncingContactIds(prev => {
        const next = new Set<string>(prev);
        next.delete(contact.id);
        return next;
      });
    }
  };

  const personContacts = props.contacts.filter(c => c.contact_type === 'person');
  const groupContacts = props.contacts.filter(c => c.contact_type === 'group');

  const selected = props.selectedContact;
  const detailContact =
    selected == null ? null : props.contacts.find((x) => x.id === selected.id) ?? selected;

  const handleSaveIntro = async () => {
    if (!detailContact) return;
    const saved = detailContact.intro ?? '';
    if (introDraft === saved) {
      setIntroHint('无修改');
      setTimeout(() => setIntroHint(null), 1500);
      return;
    }
    try {
      await props.patchContact(detailContact.id, { intro: introDraft });
      setIntroHint('已保存');
      setTimeout(() => setIntroHint(null), 2000);
    } catch (e) {
      setIntroHint(`保存失败：${String(e)}`);
    }
  };

  const handleIntroAi = async () => {
    if (!detailContact) return;
    setIntroAiLoading(true);
    setIntroHint(null);
    try {
      const res = await api.contacts.summarizeIntro(detailContact.id);
      if (!res.success || res.intro === undefined) {
        setIntroHint(res.error ?? 'AI 总结失败');
        return;
      }
      setIntroDraft(res.intro);
      await props.patchContact(detailContact.id, { intro: res.intro });
      setIntroHint('AI 总结已保存');
      setTimeout(() => setIntroHint(null), 3000);
    } catch (e) {
      setIntroHint(String(e));
    } finally {
      setIntroAiLoading(false);
    }
  };

  const anyAutoReplyEnabled = props.contacts.some(c => c.autoReply);

  const handleToggleAllAutoReply = async () => {
    const newGlobalState = !anyAutoReplyEnabled;
    try {
      await Promise.all(
        props.contacts.map(c =>
          props.patchContact(c.id, { autoReply: newGlobalState })
        )
      );
    } catch (err) {
      alert('全局切换失败: ' + err);
      await props.refreshContacts();
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      await api.messages.syncAll({ fullSyncCap: props.globalFullSyncCap });
      await props.refreshContacts();
      alert('全局同步完成');
    } catch (err) {
      alert('全局同步失败: ' + err);
    } finally {
      setSyncingAll(false);
    }
  };

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleAllAutoReply}
            className={`p-1.5 rounded-full transition-colors ${
              anyAutoReplyEnabled
                ? 'bg-green-100 text-green-600 hover:bg-green-200'
                : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
            }`}
            title={anyAutoReplyEnabled ? '关闭所有自动回复' : '开启所有自动回复'}
          >
            {anyAutoReplyEnabled ? (
              <ToggleRight className="w-5 h-5" />
            ) : (
              <ToggleLeft className="w-5 h-5" />
            )}
          </button>
          <button
            type="button"
            onClick={handleSyncAll}
            disabled={syncingAll || props.contactsStatus === 'loading'}
            className="p-1.5 rounded-lg transition-colors hover:bg-neutral-100 text-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="全局更新（同步通讯录中全部对象）"
          >
            <RefreshCw className={`w-4 h-4 ${syncingAll ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              props.setShowAddContact(true);
              props.setAddedIds(new Set());
              props.setAddSearchQuery('');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white text-sm rounded-full hover:bg-neutral-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加
          </button>
        </div>
      </div>

      {/* Loading */}
      {props.contactsStatus === 'loading' && (
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
                className="relative bg-white rounded-xl p-4 pr-16 border border-neutral-200 hover:border-neutral-300 transition-all"
              >
                <button
                  onClick={() => props.setSelectedContact(person)}
                  className="w-full text-left flex items-center"
                >
                  {person.avatar
                    ? <img src={person.avatar} alt="" className="w-12 h-12 rounded-full bg-neutral-100 flex-shrink-0" />
                    : <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0">
                        <Users className="w-6 h-6 text-neutral-400" />
                      </div>
                  }
                  <div className="flex-1 min-w-0 ml-3">
                    <span className="font-medium text-neutral-900">{person.name}</span>
                    {person.title && (
                      <p className="text-xs text-neutral-400 mt-0.5">{person.title}</p>
                    )}
                  </div>
                </button>

                <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    onClick={(e) => handleSyncFromCard(person, e)}
                    disabled={syncingContactIds.has(person.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-neutral-100 text-neutral-500 disabled:opacity-50"
                    title="同步消息"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncingContactIds.has(person.id) ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const currentVal = Boolean(person.autoReply);
                      const newVal = !currentVal;
                      props.patchContact(person.id, { autoReply: newVal });
                    }}
                    className={`p-1.5 rounded-full transition-colors ${
                      person.autoReply
                        ? 'bg-green-100 text-green-600 hover:bg-green-200'
                        : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                    }`}
                    title={person.autoReply ? '关闭自动回复' : '开启自动回复'}
                  >
                    {person.autoReply ? (
                      <ToggleRight className="w-5 h-5" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>
                  <ChevronRight className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                </div>

                <button
                  onClick={() => props.removeContact(person.id)}
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
                className="relative bg-white rounded-xl p-4 pr-16 border border-neutral-200 hover:border-neutral-300 transition-all"
              >
                <button
                  onClick={() => props.setSelectedContact(group)}
                  className="w-full text-left flex items-center"
                >
                  {group.avatar
                    ? <img src={group.avatar} alt="" className="w-12 h-12 rounded-xl bg-neutral-100 flex-shrink-0" />
                    : <div className="w-12 h-12 rounded-xl bg-neutral-200 flex items-center justify-center flex-shrink-0">
                        <MessageCircle className="w-6 h-6 text-neutral-400" />
                      </div>
                  }
                  <div className="flex-1 min-w-0 ml-3">
                    <span className="font-medium text-neutral-900">{group.name}</span>
                    {group.member_count !== undefined && (
                      <p className="text-xs text-neutral-400 mt-0.5">{group.member_count} 名成员</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                </button>

                <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    onClick={(e) => handleSyncFromCard(group, e)}
                    disabled={syncingContactIds.has(group.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-neutral-100 text-neutral-500 disabled:opacity-50"
                    title="同步消息"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncingContactIds.has(group.id) ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const currentVal = Boolean(group.autoReply);
                      const newVal = !currentVal;
                      props.patchContact(group.id, { autoReply: newVal });
                    }}
                    className={`p-1.5 rounded-full transition-colors ${
                      group.autoReply
                        ? 'bg-green-100 text-green-600 hover:bg-green-200'
                        : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                    }`}
                    title={group.autoReply ? '关闭自动回复' : '开启自动回复'}
                  >
                    {group.autoReply ? (
                      <ToggleRight className="w-5 h-5" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>
                </div>

                <button
                  onClick={() => props.removeContact(group.id)}
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
      {props.contactsStatus === 'ready' && props.contacts.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">通讯录为空</p>
          <p className="text-xs mt-1">点击右上角加号搜索并添加联系人</p>
        </div>
      )}

      {/* Add Contact Dialog */}
      {props.showAddContact && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => props.setShowAddContact(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">添加到通讯录</h3>
              <button onClick={() => props.setShowAddContact(false)} className="p-1 hover:bg-neutral-100 rounded-lg">
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
                    props.addContactType === t
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
                value={props.addSearchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                placeholder={props.addContactType === 'person' ? '输入后按回车搜索…' : '输入关键词后按回车搜索…'}
                autoFocus
                className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400"
              />
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-[100px]">
              {props.searchLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              )}
              {!props.searchLoading && props.searchResults.length === 0 && (
                <div className="text-center py-8 text-neutral-400 text-sm">
                  {props.addContactType === 'group' ? '输入关键词后按回车搜索' : '输入关键词后按回车搜索'}
                </div>
              )}
              {props.searchResults.map((c) => {
                const alreadyAdded = props.addedIds.has(c.id) || props.contacts.some(e => e.id === c.id);
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

      {/* Contact detail modal */}
      {detailContact && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => props.setSelectedContact(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 shadow-xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-4">
                {detailContact.avatar
                  ? <img src={detailContact.avatar} alt="" className={`w-14 h-14 bg-neutral-100 flex-shrink-0 ${detailContact.contact_type === 'group' ? 'rounded-xl' : 'rounded-full'}`} />
                  : <div className={`w-14 h-14 bg-neutral-200 flex items-center justify-center flex-shrink-0 ${detailContact.contact_type === 'group' ? 'rounded-xl' : 'rounded-full'}`}>
                      {detailContact.contact_type === 'group'
                        ? <MessageCircle className="w-7 h-7 text-neutral-400" />
                        : <Users className="w-7 h-7 text-neutral-400" />
                      }
                    </div>
                }
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900">{detailContact.name}</h3>
                  {detailContact.title && <p className="text-sm text-neutral-500">{detailContact.title}</p>}
                  <p className="text-xs text-neutral-400 mt-0.5">{detailContact.contact_type === 'person' ? '联系人' : '群聊'}</p>
                </div>
              </div>
              <button onClick={() => props.setSelectedContact(null)} className="p-1.5 hover:bg-neutral-100 rounded-lg flex-shrink-0">
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            {/* 简介 */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 mb-4 flex-shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-neutral-800">简介</p>
                {introHint && (
                  <span className="text-[11px] text-neutral-500 truncate max-w-[55%]">{introHint}</span>
                )}
              </div>
              <textarea
                value={introDraft}
                onChange={e => setIntroDraft(e.target.value)}
                rows={4}
                placeholder="可手动填写；或点击下方「AI 总结」根据已同步到本地的聊天记录生成。"
                className="w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg resize-none focus:outline-none focus:border-neutral-400"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveIntro()}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-900 text-white hover:bg-neutral-800"
                >
                  保存简介
                </button>
                <button
                  type="button"
                  onClick={() => void handleIntroAi()}
                  disabled={introAiLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 disabled:opacity-50"
                >
                  {introAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                  AI 总结
                </button>
              </div>
              <p className="text-[11px] text-neutral-400">
                AI 总结依赖设置中的大模型与 API Key；请先同步消息到本地。
              </p>
            </div>

            {/* 单对象消息同步 */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 mb-4 flex-shrink-0">
              <p className="text-xs font-medium text-neutral-800 mb-2">同步条数</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-600">每次最新</span>
                <input
                  key={`detail-sl-${detailContact.id}-${String(detailContact.syncLimit)}-${String(detailContact.syncMode)}`}
                  type="number"
                  min={1}
                  disabled={(detailContact.syncMode ?? props.globalDefaultSyncMode) === 'full'}
                  defaultValue={detailContact.syncLimit != null ? String(detailContact.syncLimit) : ''}
                  placeholder={String(props.globalDefaultSyncLimit)}
                  title={
                    (detailContact.syncMode ?? props.globalDefaultSyncMode) === 'full'
                      ? '此对象当前为全量同步，可先点「恢复默认」再改条数'
                      : '留空表示使用设置页默认条数'
                  }
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      void props.patchContact(detailContact.id, { syncLimit: null });
                      return;
                    }
                    const n = Number(raw);
                    if (!Number.isFinite(n) || n <= 0) return;
                    void props.patchContact(detailContact.id, { syncLimit: n });
                  }}
                  className="w-20 px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-lg disabled:opacity-50"
                />
                <span className="text-xs text-neutral-500">条</span>
                <button
                  type="button"
                  className="text-xs text-neutral-500 hover:text-neutral-800 underline decoration-neutral-300 underline-offset-2"
                  onClick={() => void props.patchContact(detailContact.id, { syncMode: null, syncLimit: null })}
                >
                  恢复默认
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 mt-2">
                留空即跟设置页；全量模式请在设置中调整。
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-4 flex-shrink-0">
              <button
                onClick={handleAnalyzeContact}
                disabled={analyzingContact}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {analyzingContact ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                AI 分析
              </button>
            </div>

            {analyzeMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg mb-3 flex-shrink-0 ${analyzeMsg.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                {analyzeMsg}
              </div>
            )}

            {/* 本对象关联的 AI 事件 */}
            <div className="rounded-xl border border-neutral-200 bg-white p-3 mb-4 flex-shrink-0 flex flex-col max-h-[min(40vh,280px)] min-h-0">
              <p className="text-xs font-medium text-neutral-800 mb-2 flex-shrink-0">本对象事件</p>
              <p className="text-[11px] text-neutral-400 mb-2 flex-shrink-0">
                来自对此联系人/群聊的 AI 分析；越靠上越新。
              </p>
              {channelEventsLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              )}
              {channelEventsError && !channelEventsLoading && (
                <div className="text-xs text-red-500 py-2">{channelEventsError}</div>
              )}
              {!channelEventsLoading && !channelEventsError && channelEvents.length === 0 && (
                <div className="text-xs text-neutral-400 py-3 text-center">暂无事件，可先同步消息后点「AI 分析」</div>
              )}
              {!channelEventsLoading && channelEvents.length > 0 && (
                <div className="overflow-y-auto space-y-2 pr-0.5 min-h-0 flex-1">
                  {channelEvents.map(ev => (
                    <div key={ev.id} className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-neutral-900 leading-snug">{ev.title}</span>
                        <span className="text-[10px] text-neutral-400 flex-shrink-0 whitespace-nowrap">
                          {formatMsgTime(ev.occurred_at)}
                        </span>
                      </div>
                      {ev.summary?.trim() ? (
                        <p className="text-xs text-neutral-600 leading-relaxed line-clamp-2">{ev.summary}</p>
                      ) : null}
                      {ev.speaker_highlights?.trim() ? (
                        <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2">
                          <span className="font-medium text-neutral-600">发言：</span>
                          {ev.speaker_highlights}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-xs font-medium text-neutral-700 truncate max-w-[120px]">{msg.sender}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {msg.ai_analysis_status_label ? (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                msg.ai_analysis_status === 'unprocessed'
                                  ? 'bg-neutral-200 text-neutral-600'
                                  : msg.ai_analysis_status === 'global_analyzed'
                                    ? 'bg-violet-100 text-violet-700'
                                    : 'bg-emerald-100 text-emerald-700'
                              }`}
                              title={msg.ai_analysis_status ?? 'unprocessed'}
                            >
                              {msg.ai_analysis_status_label}
                            </span>
                          ) : null}
                          <span className="text-xs text-neutral-400">{formatMsgTime(msg.time)}</span>
                        </div>
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
}

// ============ SettingsPage ============
interface SettingsPageProps {
  settings: SettingsType;
  setSettings: Dispatch<SetStateAction<SettingsType>>;
  settingsStatus: 'loading' | 'ready' | 'saving' | 'error';
  settingsSaved: boolean;
  saveSettings: () => Promise<void>;
}

function SettingsPage({ settings, setSettings, settingsStatus, settingsSaved, saveSettings }: SettingsPageProps) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-4 border border-neutral-200 space-y-4">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-neutral-400" />
          <h3 className="font-medium text-neutral-900">后台消息同步</h3>
        </div>
        <p className="text-xs text-neutral-500">
          开启后按设定间隔自动拉取通讯录中所有联系人/群组的最新消息（与手动「同步消息」相同逻辑）。关闭后仅可手动同步。
        </p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-800">定时同步</p>
            <p className="text-xs text-neutral-500 mt-0.5">保存设置后生效；关闭时每约 5 秒检测一次是否重新开启，一般无需重启服务。</p>
          </div>
          <button
            type="button"
            onClick={() => setSettings(s => ({ ...s, messageSyncPollingEnabled: !s.messageSyncPollingEnabled }))}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
              settings.messageSyncPollingEnabled ? 'bg-green-500' : 'bg-neutral-300'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
                settings.messageSyncPollingEnabled ? 'left-[26px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">同步间隔（秒）</label>
          <input
            type="number"
            min={30}
            max={7200}
            step={30}
            value={settings.messageSyncIntervalSec}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              setSettings(s => ({
                ...s,
                messageSyncIntervalSec: Number.isFinite(v) ? v : s.messageSyncIntervalSec,
              }));
            }}
            onBlur={() => {
              const n = Math.max(30, Math.min(7200, settings.messageSyncIntervalSec || 60));
              setSettings(s => ({ ...s, messageSyncIntervalSec: n }));
            }}
            className="w-full max-w-xs px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400"
          />
          <p className="text-[11px] text-neutral-400 mt-1">允许范围 30～7200 秒，保存时服务端会再次校验。</p>
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
          <Zap className="w-4 h-4 text-neutral-400" />
          <h3 className="font-medium text-neutral-900">自动回复系统提示词（全局）</h3>
        </div>
        <textarea
          value={settings.autoReplySystemPrompt}
          onChange={(e) => setSettings(s => ({ ...s, autoReplySystemPrompt: e.target.value }))}
          rows={4}
          placeholder="例如：你是一个飞书助手，请根据消息内容简洁友好地回复。如有具体安排请告知对方稍后处理。"
          className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400 resize-none"
        />
        <p className="text-xs text-neutral-400">
          自动回复时默认使用的系统提示词；可在单 channel 配置中设置独立提示词覆盖此全局值。
        </p>
      </div>

      <div className="bg-white rounded-xl p-4 border border-neutral-200 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-neutral-400" />
          <h3 className="font-medium text-neutral-900">AI 分析指令</h3>
        </div>
        <textarea
          value={settings.kimiCommand}
          onChange={(e) => setSettings(s => ({ ...s, kimiCommand: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400 resize-none"
        />
        <p className="text-xs text-neutral-400">AI 分析对话时使用的默认指令（与自动回复独立）</p>
      </div>

      <div className="bg-white rounded-xl p-4 border border-neutral-200 space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-neutral-400" />
          <h3 className="font-medium text-neutral-900">消息同步默认值</h3>
        </div>
        <p className="text-xs text-neutral-500">
          通讯录里未单独设置的对象，手动/自动同步都会使用该默认值；「全量」会尽量分页拉取，但仍受「全量上限」保护。
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">默认同步模式</label>
            <select
              value={settings.defaultSyncMode}
              onChange={(e) =>
                setSettings(s => ({ ...s, defaultSyncMode: e.target.value as 'latest' | 'full' }))
              }
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400"
            >
              <option value="latest">最新 N 条</option>
              <option value="full">全量（上限见下方）</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">默认条数 N（仅「最新」模式）</label>
            <input
              type="number"
              min={1}
              disabled={settings.defaultSyncMode === 'full'}
              value={settings.defaultSyncLimit}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n <= 0) return;
                setSettings(s => ({ ...s, defaultSyncLimit: n }));
              }}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">全量同步上限（条）</label>
            <input
              type="number"
              min={1}
              value={settings.fullSyncCap}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n <= 0) return;
                setSettings(s => ({ ...s, fullSyncCap: n }));
              }}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-400"
            />
            <p className="text-xs text-neutral-400 mt-1">用于「全量」模式的安全上限，避免一次拉取过大。</p>
          </div>
        </div>
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
}

// ============ App ============
function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const [alertExpanded, setAlertExpanded] = useState(true);

  const { channels } = useChats();
  const { settings, setSettings, status: settingsStatus, saved: settingsSaved, saveSettings } = useSettings();
  const {
    topics, events: _events,
    addTopic: addTopicApi, deleteTopic, toggleTopicVisibility,
    refresh: refreshTimeline,
    hideEventFromTimeline,
  } = useTimeline();

  const {
    contacts,
    status: contactsStatus,
    searchResults,
    searchLoading,
    searchLark,
    clearSearch,
    addContact,
    removeContact,
    patchContact,
    refresh: refreshContacts,
  } = useContacts();

  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');

  const [showAddContact, setShowAddContact] = useState(false);
  const [addContactType, setAddContactType] = useState<'person' | 'group'>('person');
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const [selectedContact, setSelectedContact] = useState<Person | null>(null);

  const monitoringChannels = channels.filter(c => c.isMonitoring);
  const alertChannels = monitoringChannels.filter(c => c.hasAlert);

  const [autoReplyChannels, setAutoReplyChannels] = useState<AutoReplyChannel[]>([]);
  const [loadingAutoReplyChannels, setLoadingAutoReplyChannels] = useState(true);
  const [_templates, setTemplates] = useState<Template[]>([]);
  const [selectedAutoReplyChannel, setSelectedAutoReplyChannel] = useState<AutoReplyChannel | null>(null);
  const [channelPromptDraft, setChannelPromptDraft] = useState('');
  const [channelPromptSaving, setChannelPromptSaving] = useState(false);
  const [channelPromptHint, setChannelPromptHint] = useState<string | null>(null);

  const loadAutoReplyChannels = useCallback(async () => {
    setLoadingAutoReplyChannels(true);
    try {
      const data = await api.autoReply.getChannels();
      setAutoReplyChannels(data.channels);
    } catch (err) {
      console.error('Failed to load auto-reply channels:', err);
    } finally {
      setLoadingAutoReplyChannels(false);
    }
  }, []);

  useEffect(() => {
    void loadAutoReplyChannels();
    const loadTemplatesLocal = async () => {
      try {
        const data = await api.templates.list();
        setTemplates(data.templates);
      } catch (err) {
        console.error('Failed to load templates:', err);
      }
    };
    void loadTemplatesLocal();
    // DISABLED auto-reload to prevent crashes
    // const interval = setInterval(() => void loadAutoReplyChannels(), 60000);
    // return () => clearInterval(interval);
  }, [loadAutoReplyChannels]);

  const handleToggleStatusChannel = useCallback(async (channelId: string) => {
    try {
      await api.autoReply.toggle(channelId);
      await loadAutoReplyChannels();
    } catch (err) {
      alert('操作失败: ' + err);
    }
  }, [loadAutoReplyChannels]);

  const handleToggleAutoReplyChannelMode = useCallback(async (channel: AutoReplyChannel) => {
    const next = !channel.enabled;
    try {
      await api.autoReply.setConfig(channel.type, channel.id, {
        templateId: channel.config?.templateId ?? null,
        knowledgeTags: channel.config?.knowledgeTags ?? [],
        customContext: channel.config?.customContext ?? '',
        systemPrompt: channel.config?.systemPrompt ?? '',
        enabled: next,
      });
      await loadAutoReplyChannels();
    } catch (err) {
      alert('操作失败: ' + err);
    }
  }, [loadAutoReplyChannels]);

  const addTopic = () => {
    if (!newTopicName.trim()) return;
    addTopicApi(newTopicName);
    setNewTopicName('');
    setShowAddTopic(false);
  };

  const tabs: { id: Tab; label: string; icon: typeof Bot }[] = [
    { id: 'status', label: '状态', icon: Bot },
    { id: 'timeline', label: '时间轴', icon: Clock },
    { id: 'events', label: '事件', icon: Table2 },
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
        <div className={`p-4 lg:p-8 ${activeTab === 'events' ? 'max-w-6xl' : 'max-w-3xl'}`}>
          {activeTab === 'status' && (
            <StatusPage
              autoReplyChannels={autoReplyChannels}
              loadingAutoReplyChannels={loadingAutoReplyChannels}
              alertChannels={alertChannels}
              alertExpanded={alertExpanded}
              setAlertExpanded={setAlertExpanded}
              loadAutoReplyChannels={loadAutoReplyChannels}
              selectedAutoReplyChannel={selectedAutoReplyChannel}
              setSelectedAutoReplyChannel={setSelectedAutoReplyChannel}
              channelPromptDraft={channelPromptDraft}
              setChannelPromptDraft={setChannelPromptDraft}
              channelPromptSaving={channelPromptSaving}
              setChannelPromptSaving={setChannelPromptSaving}
              channelPromptHint={channelPromptHint}
              setChannelPromptHint={setChannelPromptHint}
              handleToggleStatusChannel={handleToggleStatusChannel}
              handleToggleAutoReplyChannelMode={handleToggleAutoReplyChannelMode}
              topics={topics}
            />
          )}
          {activeTab === 'timeline' && (
            <TimelinePage
              events={_events}
              topics={topics}
              toggleTopicVisibility={toggleTopicVisibility}
              deleteTopic={deleteTopic}
              hideEventFromTimeline={hideEventFromTimeline}
              setShowAddTopic={setShowAddTopic}
            />
          )}
          {activeTab === 'events' && (
            <EventsPage refreshTimeline={refreshTimeline} />
          )}
          {activeTab === 'contacts' && (
            <ContactsPage
              contacts={contacts}
              contactsStatus={contactsStatus}
              searchResults={searchResults}
              searchLoading={searchLoading}
              searchLark={searchLark}
              clearSearch={clearSearch}
              addContact={addContact}
              removeContact={removeContact}
              patchContact={patchContact}
              refreshContacts={refreshContacts}
              globalDefaultSyncMode={settings.defaultSyncMode}
              globalDefaultSyncLimit={settings.defaultSyncLimit}
              globalFullSyncCap={settings.fullSyncCap}
              selectedContact={selectedContact}
              setSelectedContact={setSelectedContact}
              showAddContact={showAddContact}
              setShowAddContact={setShowAddContact}
              addContactType={addContactType}
              setAddContactType={setAddContactType}
              addSearchQuery={addSearchQuery}
              setAddSearchQuery={setAddSearchQuery}
              addedIds={addedIds}
              setAddedIds={setAddedIds}
              refreshTimeline={refreshTimeline}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsPage
              settings={settings}
              setSettings={setSettings}
              settingsStatus={settingsStatus}
              settingsSaved={settingsSaved}
              saveSettings={saveSettings}
            />
          )}
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
      <AddTopicModal
        showAddTopic={showAddTopic}
        setShowAddTopic={setShowAddTopic}
        newTopicName={newTopicName}
        setNewTopicName={setNewTopicName}
        addTopic={addTopic}
      />
    </div>
  );
}

export default App;
