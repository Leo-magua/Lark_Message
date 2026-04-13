import { useState, useEffect } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  Loader2,
  Star,
  MessageSquare,
} from 'lucide-react';
import type { Template } from '@/types';
import { api } from '@/lib/api';

export function TemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.templates.list();
      setItems(data.templates);
    } catch (err) {
      alert('加载失败: ' + err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSystemPrompt('');
    setDescription('');
    setShowModal(true);
  };

  const openEdit = (item: Template) => {
    setEditing(item);
    setName(item.name);
    setSystemPrompt(item.systemPrompt);
    setDescription(item.description || '');
    setShowModal(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.templates.update(editing.id, { name, systemPrompt, description });
      } else {
        await api.templates.create({ name, systemPrompt, description });
      }
      setShowModal(false);
      load();
    } catch (err) {
      alert('保存失败: ' + err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('确定删除这个模板？')) return;
    try {
      await api.templates.delete(id);
      load();
    } catch (err) {
      alert('删除失败: ' + err);
    }
  };

  const setDefault = async (id: number) => {
    try {
      await api.templates.setDefault(id);
      load();
    } catch (err) {
      alert('设置默认失败: ' + err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">回复模板</h2>
          <p className="text-xs text-neutral-500 mt-0.5">定义 AI 自动回复的 personality 和行为</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white text-sm rounded-full hover:bg-neutral-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增模板
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          加载中...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-neutral-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无模板</p>
          <p className="text-xs mt-1">创建模板来自定义 AI 回复风格</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl p-4 border border-neutral-200">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-neutral-900 truncate">{item.name}</h3>
                    {item.isDefault && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                        <Star className="w-3 h-3 fill-amber-600" />
                        默认
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!item.isDefault && (
                    <button
                      onClick={() => setDefault(item.id)}
                      className="px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors"
                      title="设为默认"
                    >
                      设为默认
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(item)}
                    className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4 text-neutral-400" />
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    disabled={item.isDefault}
                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
              <div className="mt-2 p-2 bg-neutral-50 rounded-lg">
                <p className="text-xs text-neutral-500 font-mono line-clamp-3">{item.systemPrompt}</p>
              </div>
              <p className="text-xs text-neutral-400 mt-2">{item.createdAt}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-neutral-900">
                {editing ? '编辑模板' : '新增模板'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">模板名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：客服助手"
                  className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">System Prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="你是一个友好的助手..."
                  rows={5}
                  className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400 resize-none font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">描述（可选）</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简短描述这个模板的用途"
                  className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={save}
                disabled={saving || !name.trim() || !systemPrompt.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm rounded-xl hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
