import React, { useState, useEffect } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import PresetTemplateCard from "./PresetTemplateCard";
import AssistantLibrary from "@/models/assistantLibrary";

/**
 * 预配置模板选择器组件 - 科技感现代设计
 * @param {Object} props
 * @param {string} props.selectedPresetId - 已选择的预配置模板 ID
 * @param {function} props.onSelect - 选择回调 (preset) => void
 * @param {boolean} props.showSearch - 是否显示搜索框
 */
export default function PresetTemplateSelector({
  selectedPresetId,
  onSelect,
  showSearch = true,
}) {
  const [presets, setPresets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [searchQuery, setSearchQuery] = useState("");

  // 加载预配置模板
  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    setLoading(true);
    try {
      const result = await AssistantLibrary.getPresets();
      if (result.success && result.data) {
        setPresets(result.data.presets || []);
        setCategories(result.data.categories || ["全部"]);
      }
    } catch (error) {
      console.error("Failed to load presets:", error);
    } finally {
      setLoading(false);
    }
  };

  // 过滤预配置模板
  const filteredPresets = presets.filter((preset) => {
    // 分类过滤
    if (selectedCategory !== "全部" && preset.category !== selectedCategory) {
      return false;
    }
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        preset.name.toLowerCase().includes(query) ||
        preset.description.toLowerCase().includes(query) ||
        (preset.tags || []).some((tag) => tag.toLowerCase().includes(query))
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-theme-text-secondary">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>加载 AI 员工模板...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 搜索和分类过滤 - 现代布局 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* 搜索框 - 深色风格 */}
        {showSearch && (
          <div className="relative w-full sm:w-72">
            <MagnifyingGlass
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-theme-text-secondary"
            />
            <input
              type="text"
              placeholder="搜索模板..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-2.5 rounded-xl bg-[#151c28] border border-[#2a3a50] text-theme-text-primary placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-text-secondary hover:text-theme-text-secondary transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* 分类标签 - 胶囊按钮风格 */}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${
                  selectedCategory === cat
                    ? "bg-blue-600 text-theme-text-primary shadow-lg shadow-blue-500/20"
                    : "bg-[#1a2332] text-theme-text-secondary border border-[#2a3a50] hover:bg-[#1e2940] hover:text-theme-text-primary hover:border-[#3a4a60]"
                }
              `}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 模板网格 - 4列布局 */}
      {filteredPresets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPresets.map((preset) => (
            <PresetTemplateCard
              key={preset.id}
              preset={preset}
              selected={selectedPresetId === preset.id}
              onClick={() => onSelect(preset)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-theme-text-secondary">
          <MagnifyingGlass size={48} className="mb-4 opacity-50" />
          <p className="text-lg">没有找到匹配的模板</p>
          <p className="text-sm mt-1">尝试调整搜索条件或选择其他分类</p>
        </div>
      )}
    </div>
  );
}
