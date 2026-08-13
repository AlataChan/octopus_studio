import React, { useState } from "react";
import { X, Tag } from "@phosphor-icons/react";
import Button from "@/components/Button";

/**
 * 创建项目弹窗
 */
export default function CreateEpisodeModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleAddTag = (e) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    await onCreate({
      name: name.trim(),
      description: description.trim(),
      tags,
    });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-theme-bg-secondary border border-theme-border rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h3 className="text-lg font-semibold text-theme-text-primary">
            创建新项目
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* 项目名称 */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              项目名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：网站首页重构"
              className="w-full px-3 py-2 bg-white/5 border border-theme-border rounded-lg text-theme-text-primary placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>

          {/* 项目描述 */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              项目描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述项目目标和范围..."
              rows={3}
              className="w-full px-3 py-2 bg-white/5 border border-theme-border rounded-lg text-theme-text-primary placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            />
          </div>

          {/* 标签 */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              标签
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-300 rounded-full text-sm"
                >
                  <Tag className="h-3 w-3" />
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-theme-text-primary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="输入标签后按 Enter 添加"
              className="w-full px-3 py-2 bg-white/5 border border-theme-border rounded-lg text-theme-text-primary placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* 提交按钮 */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" onClick={onClose} variant="muted">
              取消
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || loading}
              loading={loading}
            >
              {loading ? "创建中..." : "创建项目"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
