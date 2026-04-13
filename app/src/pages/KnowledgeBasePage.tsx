import { useState, useEffect } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  Loader2,
  Tag as TagIcon,
  FileText,
} from 'lucide-react';
import type { Knowledge } from '@/types';
import { api } from '@/lib/api';

export function KnowledgeBasePage() {
  const [items, setItems] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Knowledge | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState(''); // comma-separated

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.knowledge.list();
      setItems(data.knowledge);
    } catch (err) {
      alert('加载失败: ' + err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setContent('');
    setTagsInput('');
    setShowModal(true);
  };

  const openEdit = (item: Knowledge) => {
    setEditing(item);
    setTitle(item.title);
    setContent(item.content);
    setTagsInput(item.tags.join(', '));
    setShowModal(true);
  };

  const save = async () => {
    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      if (editing) {
        await api.knowledge.update(editing.id, { title, content, tags });
      } else {
        await api.knowledge.create({ title, content, tags });
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
    if (!confirm('确定删除这条知识？')) return;
    try {
      await api.knowledge.delete(id);
      load();
    } catch (err) {
      alert('删除失败: ' + err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">知识库</h2>
          <p className="text-xs text-neutral-500 mt-0.5">管理自动回复的知识片段</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white text-sm rounded-full hover:bg-neutral-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          加载中...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-neutral-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">知识库为空</p>
          <p className="text-xs mt-1">点击右上角添加知识片段</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl p-4 border border-neutral-200">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-medium text-neutral-900">{item.title}</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(item)}
                    className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4 text-neutral-400" />
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-neutral-600 mb-3 line-clamp-3">{item.content}</p>
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs rounded-full"
                    >
                      <TagIcon className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
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
                {editing ? '编辑知识' : '新增知识'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="知识标题"
                  className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">内容</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="知识内容..."
                  rows={6}
                  className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-400 resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">标签（逗号分隔）</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="如：产品, Q2, 规划"
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
                disabled={saving || !title.trim() || !content.trim()}
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
