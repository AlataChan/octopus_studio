import {
  X,
  FileText,
  ChatCircle,
  Robot,
  Tag,
  Clock,
  Link,
} from "@phosphor-icons/react";
import Button from "@/components/Button";

/**
 * 格式化时间戳
 * @param {string|number} timestamp
 * @returns {string}
 */
const formatTime = (timestamp) => {
  if (!timestamp) return "未知";
  const date = new Date(timestamp);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * 节点类型图标映射
 */
const TypeIcon = ({ type, className = "" }) => {
  const iconProps = { size: 20, weight: "fill", className };
  switch (type) {
    case "doc":
      return (
        <FileText
          {...iconProps}
          className={`${className} text-theme-text-primary`}
        />
      );
    case "chat":
      return (
        <ChatCircle
          {...iconProps}
          className={`${className} text-theme-text-secondary`}
        />
      );
    case "assistant":
      return (
        <Robot
          {...iconProps}
          className={`${className} text-theme-accent-primary`}
        />
      );
    case "tag":
      return (
        <Tag
          {...iconProps}
          className={`${className} text-theme-text-secondary`}
        />
      );
    default:
      return <FileText {...iconProps} />;
  }
};

/**
 * 节点类型中文名称
 */
const typeNames = {
  doc: "文档",
  chat: "对话",
  assistant: "AI 员工",
  tag: "标签",
};

/**
 * 文档节点详情
 */
const DocDetail = ({ data }) => (
  <div className="space-y-3">
    {data.filename && <DetailRow label="文件名" value={data.filename} />}
    {data.docType && <DetailRow label="类型" value={data.docType} />}
    {data.createdAt && (
      <DetailRow
        label="创建时间"
        value={formatTime(data.createdAt)}
        icon={<Clock size={14} />}
      />
    )}
    {data.path && <DetailRow label="路径" value={data.path} truncate />}
  </div>
);

/**
 * 对话节点详情
 */
const ChatDetail = ({ data }) => (
  <div className="space-y-3">
    {data.prompt && (
        <div className="text-sm">
        <div className="text-theme-text-secondary mb-1">提问内容</div>
        <div className="text-theme-text-primary bg-theme-bg-secondary p-2 rounded text-xs max-h-32 overflow-y-auto">
          {data.prompt.length > 200
            ? `${data.prompt.slice(0, 200)}...`
            : data.prompt}
        </div>
      </div>
    )}
    {data.assistant && (
      <DetailRow
        label="使用助手"
        value={data.assistant}
        icon={<Robot size={14} />}
      />
    )}
    {data.createdAt && (
      <DetailRow
        label="时间"
        value={formatTime(data.createdAt)}
        icon={<Clock size={14} />}
      />
    )}
  </div>
);

/**
 * 助手节点详情
 */
const AssistantDetail = ({ data }) => {
  const collaborators = Array.isArray(data.collaborators)
    ? data.collaborators
    : [];

  return (
    <div className="space-y-3">
      {data.description && (
        <div className="text-sm">
          <div className="text-theme-text-secondary mb-1">描述</div>
          <div className="text-theme-text-primary">{data.description}</div>
        </div>
      )}
      {data.chatCount !== undefined && (
        <DetailRow
          label="对话次数"
          value={`${data.chatCount} 次`}
          icon={<ChatCircle size={14} />}
        />
      )}
      {data.docCount !== undefined && (
        <DetailRow
          label="关联文档"
          value={`${data.docCount} 个`}
          icon={<FileText size={14} />}
        />
      )}
      {collaborators.length > 0 && (
        <div className="text-sm">
          <div className="text-theme-text-secondary mb-1">协作 AI 员工</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {collaborators.map((item) => (
              <div
                key={item.agentId}
                className="flex items-center justify-between text-xs text-theme-text-primary"
              >
                <span className="truncate max-w-[150px]" title={item.label}>
                  {item.label}
                </span>
                <span className="text-theme-text-secondary">{item.count}次</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 标签节点详情
 */
const TagDetail = ({ data }) => (
  <div className="space-y-3">
    {data.degree !== undefined && (
      <DetailRow
        label="关联节点"
        value={`${data.degree} 个`}
        icon={<Link size={14} />}
      />
    )}
  </div>
);

/**
 * 详情行组件
 */
const DetailRow = ({ label, value, icon, truncate = false }) => (
  <div className="flex items-center text-sm">
    {icon && <span className="mr-1.5 text-theme-text-secondary">{icon}</span>}
    <span className="text-theme-text-secondary mr-2">{label}:</span>
    <span
      className={`text-theme-text-primary ${truncate ? "truncate max-w-[180px]" : ""}`}
    >
      {value}
    </span>
  </div>
);

/**
 * 侧滑详情卡片组件
 * @param {Object} props
 * @param {Object} props.node - 选中的节点数据
 * @param {Function} props.onClose - 关闭回调
 * @param {Function} props.onViewMore - 查看更多回调
 */
export default function NodeDetailPanel({ node, onClose, onViewMore }) {
  if (!node) return null;

  const { type, label } = node;

  return (
    <div
      className="absolute right-0 top-0 h-full w-80 bg-sidebar border-l border-theme-border shadow-2xl z-10 flex flex-col"
      style={{ animation: "slideInRight 0.2s ease-out" }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-theme-border">
        <div className="flex items-center gap-2">
          <TypeIcon type={type} />
          <span className="text-xs text-theme-text-secondary">
            {typeNames[type] || "节点"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-theme-bg-secondary rounded transition-colors"
          aria-label="关闭详情"
        >
          <X size={18} className="text-theme-text-secondary" />
        </button>
      </div>

      {/* 标题 */}
      <div className="px-4 py-3 border-b border-theme-border">
        <h3
          className="text-base font-medium text-theme-text-primary truncate"
          title={label}
        >
          {label}
        </h3>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-4">
        {type === "doc" && <DocDetail data={node} />}
        {type === "chat" && <ChatDetail data={node} />}
        {type === "assistant" && <AssistantDetail data={node} />}
        {type === "tag" && <TagDetail data={node} />}
      </div>

      {/* 底部操作 */}
      {onViewMore && (type === "doc" || type === "chat") && (
        <div className="p-4 border-t border-theme-border">
          <Button className="w-full" onClick={() => onViewMore(node)} size="sm">
            查看完整内容
          </Button>
        </div>
      )}

      {/* 动画样式 */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
