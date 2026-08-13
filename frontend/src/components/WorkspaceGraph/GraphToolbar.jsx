import { useState, useCallback, useEffect, useRef } from "react";
import {
  MagnifyingGlass,
  X,
  ArrowsOut,
  FileText,
  ChatCircle,
  Robot,
  Tag,
} from "@phosphor-icons/react";
import debounce from "lodash.debounce";

/**
 * 节点类型过滤选项
 */
const typeFilters = [
  {
    type: "doc",
    label: "文档",
    icon: FileText,
    color: "text-theme-text-primary",
  },
  {
    type: "chat",
    label: "对话",
    icon: ChatCircle,
    color: "text-theme-text-secondary",
  },
  {
    type: "assistant",
    label: "AI 员工",
    icon: Robot,
    color: "text-theme-accent-primary",
  },
  { type: "tag", label: "标签", icon: Tag, color: "text-theme-text-secondary" },
  {
    type: "concept",
    label: "概念",
    icon: Tag,
    color: "text-theme-accent-primary",
  },
  {
    type: "entity",
    label: "实体",
    icon: Robot,
    color: "text-theme-text-primary",
  },
  {
    type: "comparison",
    label: "对比",
    icon: ChatCircle,
    color: "text-theme-text-secondary",
  },
  {
    type: "timeline",
    label: "时间线",
    icon: FileText,
    color: "text-theme-text-secondary",
  },
];

/**
 * 图谱工具栏组件
 * @param {Object} props
 * @param {Function} props.onSearch - 搜索回调 (keyword: string) => void
 * @param {Function} props.onFilterChange - 过滤变化回调 (types: string[]) => void
 * @param {Function} props.onResetView - 重置视图回调
 * @param {Object} props.stats - 统计信息 { nodeCount, edgeCount }
 * @param {boolean} props.isLoading - 是否正在加载
 */
export default function GraphToolbar({
  onSearch,
  onFilterChange,
  onResetView,
  stats = {},
  isLoading = false,
}) {
  const [searchValue, setSearchValue] = useState("");
  const [activeTypes, setActiveTypes] = useState([
    "doc",
    "chat",
    "assistant",
    "tag",
    "concept",
    "entity",
    "comparison",
    "timeline",
  ]);
  const searchInputRef = useRef(null);

  // 防抖搜索
  const debouncedSearch = useCallback(
    debounce((value) => {
      onSearch?.(value);
    }, 300),
    [onSearch]
  );

  // 搜索输入处理
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchValue(value);
    debouncedSearch(value);
  };

  // 清除搜索
  const handleClearSearch = () => {
    setSearchValue("");
    onSearch?.("");
    searchInputRef.current?.focus();
  };

  // 类型过滤切换
  const handleTypeToggle = (type) => {
    const newTypes = activeTypes.includes(type)
      ? activeTypes.filter((t) => t !== type)
      : [...activeTypes, type];

    // 至少保留一个类型
    if (newTypes.length === 0) return;

    setActiveTypes(newTypes);
    onFilterChange?.(newTypes);
  };

  // 键盘快捷键：Cmd/Ctrl + F 聚焦搜索
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-sidebar border-b border-theme-border">
      {/* 搜索框 */}
      <div className="relative flex-1 max-w-md">
        <MagnifyingGlass
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-secondary"
        />
        <input
          ref={searchInputRef}
          type="text"
          value={searchValue}
          onChange={handleSearchChange}
          placeholder="搜索节点... (⌘+F)"
          className="w-full pl-9 pr-8 py-1.5 text-sm bg-theme-bg-secondary border border-theme-border rounded focus:outline-none focus:border-theme-accent-primary text-theme-text-primary placeholder:text-theme-text-secondary"
        />
        {searchValue && (
          <button
            onClick={handleClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-theme-bg-primary rounded"
            aria-label="清除搜索"
          >
            <X size={14} className="text-theme-text-secondary" />
          </button>
        )}
      </div>

      {/* 类型过滤 */}
      <div className="flex items-center gap-1">
        {typeFilters.map(({ type, label, icon: Icon, color }) => (
          <button
            key={type}
            onClick={() => handleTypeToggle(type)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              activeTypes.includes(type)
                ? "bg-theme-settings-input-bg text-theme-text-primary"
                : "bg-transparent text-theme-text-secondary"
            }`}
            title={`${activeTypes.includes(type) ? "隐藏" : "显示"}${label}`}
          >
            <Icon
              size={14}
              weight="fill"
              className={activeTypes.includes(type) ? color : ""}
            />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* 统计信息 */}
      {stats?.nodeCount !== undefined && (
        <div className="text-xs text-theme-text-secondary hidden md:block">
          {stats.nodeCount} 节点 | {stats.edgeCount || 0} 关系
        </div>
      )}

      {/* 重置视图按钮 */}
      <button
        onClick={onResetView}
        className="p-1.5 hover:bg-theme-bg-secondary rounded transition-colors"
        title="重置视图"
        aria-label="重置视图"
      >
        <ArrowsOut size={18} className="text-theme-text-secondary" />
      </button>

      {/* 加载指示器 */}
      {isLoading && (
        <div className="w-4 h-4 border-2 border-primary-button border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}
