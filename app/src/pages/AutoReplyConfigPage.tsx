import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Loader2,
  Tag as TagIcon,
  MessageSquare,
  Bot,
  Settings,
  Power,
  RotateCcw,
  ListFilter,
} from 'lucide-react';
import type { AutoReplyChannel, Template, Knowledge, AutoReplyConfig } from '@/types';
import { api } from '@/lib/api';

interface Props {
  channel: AutoReplyChannel;
  onBack: () => void;
}

export function AutoReplyConfigPage({ channel, onBack }: Props) {
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);

  // Form state - config may be null if not yet configured
  const config = (channel.config || {}) as AutoReplyConfig;
  const [templateId, setTemplateId] = useState<number | null>(config.templateId ?? null);
  const [knowledgeTags, setKnowledgeTags] = useState<string[]>(config.knowledgeTags ?? []);
  const [customContext, setCustomContext] = useState(config.customContext || '');
  const [enabled, setEnabled] = useState(!!config.enabled);
  // Sync settings (from parent channel - these are on the channel itself)
  const [syncMode, setSyncMode] = useState<'latest' | 'full'>((channel as any).syncMode || 'latest');
  const [syncLimit, setSyncLimit] = useState<number>((channel as any).syncLimit || 20);

  useEffect(() => {
    loadSelects();
  }, []);

  const loadSelects = async () => {
    try {
      const [tplsRes, knRes] = await Promise.all([
        api.templates.list().catch(() => ({ templates: [] })),
        api.knowledge.list().catch(() => ({ knowledge: [] }))
      ]);
      setTemplates(tplsRes.templates || []);
      setKnowledge(knRes.knowledge || []);
    } catch (err) {
      console.error('Failed to load selects:', err);
      setTemplates([]);
      setKnowledge([]);
    }
  };

  const allTags = Array.from(new Set(knowledge.flatMap(k => k.tags))).sort();

  const toggleTag = (tag: string) => {
    setKnowledgeTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.autoReply.setConfig(channel.type, channel.id, {
        templateId,
        knowledgeTags,
        customContext,
        enabled,
      });
      // Update channel's autoReply and sync settings
      if (channel.type === 'group') {
        await api.chats.update(channel.id, { autoReply: enabled, syncMode, syncLimit });
      } else {
        await api.contacts.patch(channel.id, { autoReply: enabled, syncMode, syncLimit });
      }
      onBack();
    } catch (err) {
      alert('保存失败: ' + err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-neutral-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-neutral-900 truncate">{channel.name}</h2>
          <p className="text-xs text-neutral-500">
            {channel.type === 'group' ? '群聊' : '联系人'} · 自动回复配置
          </p>
        </div>
      </div>

      {/* Channel info */}
      <div className="bg-white rounded-xl p-4 border border-neutral-200 flex items-center gap-3">
        {channel.avatar ? (
          <img
            src={channel.avatar}
            alt=""
            className={`w-12 h-12 bg-neutral-100 flex-shrink-0 ${channel.type === 'group' ? 'rounded-xl' : 'rounded-full'}`}
          />
        ) : (
          <div className={`w-12 h-12 bg-neutral-200 flex items-center justify-center flex-shrink-0 ${channel.type === 'group' ? 'rounded-xl' : 'rounded-full'}`}>
            {channel.type === 'group' ? <MessageSquare className="w-6 h-6 text-neutral-400" /> : <Bot className="w-6 h-6 text-neutral-400" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-neutral-900 truncate">{channel.name}</p>
          <p className="text-xs text-neutral-500">ID: {channel.id}</p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            enabled ? 'bg-green-500 text-white' : 'bg-neutral-200 text-neutral-500'
          }`}
        >
          <Power className="w-3 h-3" />
          {enabled ? '已启用' : '已关闭'}
        </button>
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* Template selection */}
        <div className="bg-white rounded-xl p-4 border border-neutral-200 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-neutral-400" />
            <h3 className="font-medium text-neutral-900">回复模板</h3>
          </div>
          <select
            value={templateId ?? ''}
            onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400"
          >
            <option value="">选择模板（可选）</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.isDefault ? '（默认）' : ''}
              </option>
            ))}
          </select>
          {templateId && (
            <div className="mt-2 p-2 bg-neutral-50 rounded text-xs text-neutral-500">
              {templates.find(t => t.id === templateId)?.systemPrompt}
            </div>
          )}
        </div>

        {/* Knowledge tags */}
        <div className="bg-white rounded-xl p-4 border border-neutral-200 space-y-3">
          <div className="flex items-center gap-2">
            <TagIcon className="w-4 h-4 text-neutral-400" />
            <h3 className="font-medium text-neutral-900">知识标签</h3>
            <span className="text-xs text-neutral-400">（从知识库选择）</span>
          </div>
          {allTags.length === 0 ? (
            <p className="text-xs text-neutral-400">暂无知识标签，请先添加知识片段</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const selected = knowledgeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-purple-100 text-purple-700 border border-purple-200'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom context */}
        <div className="bg-white rounded-xl p-4 border border-neutral-200 space-y-3">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-neutral-400" />
            <h3 className="font-medium text-neutral-900">自定义上下文</h3>
          </div>
          <textarea
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder="额外的指令或上下文信息..."
            rows={4}
            className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400 resize-none"
          />
        </div>

        {/* Message sync settings */}
        <div className="bg-white rounded-xl p-4 border border-neutral-200 space-y-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-neutral-400" />
            <h3 className="font-medium text-neutral-900">消息同步设置</h3>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-600">同步模式</span>
            <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setSyncMode('latest')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  syncMode === 'latest'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                最新消息
              </button>
              <button
                type="button"
                onClick={() => setSyncMode('full')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  syncMode === 'full'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                全量同步
              </button>
            </div>
          </div>
          {syncMode === 'latest' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">同步条数限制</span>
              <div className="flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-neutral-400" />
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={syncLimit}
                  onChange={(e) => setSyncLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                  className="w-20 px-2 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-right focus:outline-none focus:border-neutral-400"
                />
                <span className="text-xs text-neutral-400">条</span>
              </div>
            </div>
          )}
          <p className="text-xs text-neutral-400">
            {syncMode === 'full'
              ? '全量同步将拉取所有历史消息（首次同步可能较慢）'
              : '仅同步最新消息，可设置最大同步条数'}
          </p>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={save}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white py-3 rounded-xl hover:bg-neutral-800 disabled:opacity-60 transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        保存配置
      </button>
    </div>
  );
}
