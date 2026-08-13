import { useEffect, useRef, useState } from "react";
import Backdrop from "@/components/Backdrop";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import AssistantLibrary from "@/models/assistantLibrary";
import {
  Sparkle,
  CaretDown,
  CloudArrowUp,
  Phone,
  DotsThree,
  Robot,
} from "@phosphor-icons/react";

/**
 * 获取外部平台的显示信息
 * @param {string} platformType - 平台类型
 * @returns {{name: string, color: string}} 平台名称和颜色
 */
function getPlatformInfo(platformType) {
  const platforms = {
    dify: { name: "Dify", color: "text-[var(--theme-accent-secondary)]" },
    ragflow: { name: "RAGFlow", color: "text-purple-400" },
    n8n: { name: "n8n", color: "text-pink-400" },
    coze: { name: "Coze", color: "text-green-400" },
    fastgpt: { name: "FastGPT", color: "text-orange-400" },
  };
  return (
    platforms[platformType] || {
      name: "外部",
      color: "text-theme-text-secondary",
    }
  );
}

function assistantIdsMatch(left, right) {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  ) {
    return false;
  }
  return String(left) === String(right);
}

export function getAssistantSelectionAfterLoad({
  assistants = [],
  selectedAssistantId = null,
  didAutoSelect = false,
}) {
  if (!Array.isArray(assistants) || assistants.length === 0) {
    return { shouldSelect: false, nextAssistantId: null, didAutoSelect };
  }

  const selectedExists =
    selectedAssistantId &&
    assistants.some((assistant) =>
      assistantIdsMatch(assistant.id, selectedAssistantId)
    );

  if (selectedExists) {
    return {
      shouldSelect: false,
      nextAssistantId: selectedAssistantId,
      didAutoSelect,
    };
  }

  if (!selectedAssistantId && didAutoSelect) {
    return { shouldSelect: false, nextAssistantId: null, didAutoSelect };
  }

  return {
    shouldSelect: true,
    nextAssistantId: assistants[0].id,
    didAutoSelect: true,
  };
}

/**
 * AI 员工选择器组件
 * 在聊天界面显示，允许用户选择使用哪位 AI 员工
 */
export default function AssistantSelector({
  workspaceSlug,
  selectedAssistantId,
  onSelect,
  onVoiceModeChange, // 新增：语音模式变化回调
}) {
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false); // 语音模式状态
  const autoSelectedWorkspaceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    autoSelectedWorkspaceRef.current = null;

    async function fetchAssistants() {
      setLoading(true);
      const result = await WorkspaceAssistant.list(workspaceSlug);
      if (cancelled) return;

      if (result.success) {
        // 只显示已启用的员工
        const enabledAssistants = (result.data.assistants || []).filter(
          (a) => a.enabled
        );
        setAssistants(enabledAssistants);
      } else {
        setAssistants([]);
      }
      setLoading(false);
    }
    fetchAssistants();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  useEffect(() => {
    if (loading) return;

    const selection = getAssistantSelectionAfterLoad({
      assistants,
      selectedAssistantId,
      didAutoSelect: autoSelectedWorkspaceRef.current === workspaceSlug,
    });

    if (!selection.shouldSelect) return;

    autoSelectedWorkspaceRef.current = workspaceSlug;
    onSelect(selection.nextAssistantId);
  }, [assistants, loading, selectedAssistantId, workspaceSlug, onSelect]);

  // 如果没有员工，不显示选择器
  if (loading || assistants.length === 0) {
    return null;
  }

  const selectedAssistant = assistants.find((a) =>
    assistantIdsMatch(a.id, selectedAssistantId)
  );

  // 获取员工显示名称
  const getAssistantDisplayName = (assistant) => {
    return (
      assistant.instanceName ||
      assistant.template?.employeeName ||
      assistant.template?.name ||
      "未命名员工"
    );
  };

  // 获取头像URL
  const getAvatarUrl = (assistant) => {
    if (assistant?.template?.avatarUrl) {
      return AssistantLibrary.getIconUrl(assistant.template.avatarUrl);
    }
    return null;
  };

  // 切换语音模式
  const toggleVoiceMode = (e) => {
    e.stopPropagation();
    const newVoiceMode = !isVoiceMode;
    setIsVoiceMode(newVoiceMode);
    // 通知父组件语音模式变化
    if (onVoiceModeChange) {
      onVoiceModeChange(newVoiceMode);
    }
  };

  return (
    <div className="relative w-full mb-2 z-20">
      {/* 语音模式提示条 */}
      {isVoiceMode && (
        <div className="absolute -top-8 left-0 right-0 flex items-center justify-center gap-2 text-xs text-[var(--theme-accent-primary)] animate-pulse">
          <div className="w-2 h-2 bg-[var(--theme-accent-primary)] rounded-full animate-ping"></div>
          <span>语音模式已开启 - 正在监听...</span>
        </div>
      )}
      <div className="relative z-20 flex items-center justify-between w-full py-2 bg-transparent rounded-lg transition-all duration-200">
        {/* 左侧：头像 + 姓名职位 + 下拉按钮 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-x-3 flex-1 hover:bg-theme-sidebar-item-hover rounded-lg py-1 px-2 -mx-2 transition-colors"
        >
          {/* 头像 */}
          {selectedAssistant ? (
            <div className="relative">
              {getAvatarUrl(selectedAssistant) ? (
                <img
                  src={getAvatarUrl(selectedAssistant)}
                  alt={getAssistantDisplayName(selectedAssistant)}
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-theme-border-subtle"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[var(--theme-accent-soft)] flex items-center justify-center ring-1 ring-theme-border-subtle">
                  <Robot size={20} className="text-theme-text-primary" />
                </div>
              )}
              {/* 在线状态绿点 */}
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-theme-bg-chat-input"></div>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-theme-sidebar-item-default flex items-center justify-center ring-1 ring-theme-border-subtle">
              <Sparkle
                size={18}
                weight="fill"
                className="text-theme-accent-primary"
              />
            </div>
          )}

          {/* 姓名和职位 */}
          <div className="flex flex-col items-start flex-1">
            <div className="flex items-center gap-x-2">
              <span className="text-theme-text-primary text-sm font-semibold">
                {selectedAssistant
                  ? getAssistantDisplayName(selectedAssistant)
                  : "选择员工"}
              </span>
              {/* 外部平台标识 */}
              {selectedAssistant?.template?.platformType &&
                selectedAssistant.template.platformType !== "internal" && (
                  <span
                    className={`flex items-center gap-x-1 px-1.5 py-0.5 rounded text-[10px] ${getPlatformInfo(selectedAssistant.template.platformType).color} bg-theme-border-subtle`}
                  >
                    <CloudArrowUp size={10} weight="fill" />
                    {
                      getPlatformInfo(selectedAssistant.template.platformType)
                        .name
                    }
                  </span>
                )}
            </div>
            {selectedAssistant?.template?.employeeTitle && (
              <span className="text-theme-text-secondary text-xs">
                {selectedAssistant.template.employeeTitle}
              </span>
            )}
          </div>

          {/* 下拉图标 */}
          <CaretDown
            size={16}
            className={`text-theme-text-secondary transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* 右侧：电话和更多按钮 */}
        {selectedAssistant && (
          <div className="flex items-center gap-x-2 ml-2 border-l border-theme-border pl-2">
            <button
              onClick={toggleVoiceMode}
              aria-label={isVoiceMode ? "关闭语音模式" : "开启语音模式"}
              className={`p-2 rounded-lg transition-all ${
                isVoiceMode
                  ? "bg-[var(--theme-accent-primary)] text-[var(--theme-button-primary-text)] animate-pulse-glow"
                  : "hover:bg-theme-sidebar-item-hover text-[var(--theme-accent-primary)]"
              }`}
              title={isVoiceMode ? "关闭语音模式" : "开启语音模式"}
            >
              <Phone size={20} weight={isVoiceMode ? "fill" : "regular"} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                // TODO: 更多操作菜单
                console.log("More actions");
              }}
              aria-label="更多操作"
              className="p-2 rounded-lg hover:bg-theme-sidebar-item-hover text-theme-text-secondary transition-colors"
              title="更多操作"
            >
              <DotsThree size={20} weight="bold" />
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <Backdrop open={isOpen} onClose={() => setIsOpen(false)} className="!bg-transparent !backdrop-blur-0" />

          {/* 下拉菜单 */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-2xl z-modal max-h-96 overflow-y-auto">
            {/* 默认选项：不使用员工 */}
            <button
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-x-3 px-4 py-3 hover:bg-theme-bg-primary transition-colors ${
                !selectedAssistantId ? "bg-[var(--theme-accent-soft)]" : ""
              }`}
            >
              <div className="flex items-center gap-x-2 flex-1">
                <span className="text-theme-text-secondary text-sm">
                  不使用员工
                </span>
              </div>
              {!selectedAssistantId && (
                <div className="w-2 h-2 rounded-full bg-theme-accent-primary" />
              )}
            </button>

            {/* 分隔线 */}
            <div className="border-t border-theme-border my-1" />

            {/* 员工列表 */}
            {assistants.map((assistant) => (
              <button
                key={assistant.id}
                onClick={() => {
                  onSelect(assistant.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-x-3 px-4 py-3 hover:bg-theme-bg-primary transition-colors ${
                  assistantIdsMatch(selectedAssistantId, assistant.id)
                    ? "bg-[var(--theme-accent-soft)]"
                    : ""
                }`}
              >
                {/* 员工头像或图标 */}
                {assistant.template?.avatarUrl ? (
                  <img
                    src={AssistantLibrary.getIconUrl(
                      assistant.template.avatarUrl
                    )}
                    alt={assistant.template.employeeName}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-xl">
                    {assistant.template?.icon || "🤖"}
                  </span>
                )}
                <div className="flex flex-col items-start flex-1">
                  <div className="flex items-center gap-x-2">
                    <span className="text-theme-text-primary text-sm font-medium">
                      {getAssistantDisplayName(assistant)}
                    </span>
                    {/* 外部平台标识 */}
                    {assistant.template?.platformType &&
                      assistant.template.platformType !== "internal" && (
                        <span
                          className={`flex items-center gap-x-1 px-2 py-0.5 rounded text-xs ${getPlatformInfo(assistant.template.platformType).color} bg-theme-border-subtle`}
                        >
                          <CloudArrowUp size={12} weight="fill" />
                          {
                            getPlatformInfo(assistant.template.platformType)
                              .name
                          }
                        </span>
                      )}
                  </div>
                  {assistant.template?.employeeTitle && (
                    <span className="text-theme-text-secondary text-xs opacity-60">
                      {assistant.template.employeeTitle}
                    </span>
                  )}
                </div>
                {assistantIdsMatch(selectedAssistantId, assistant.id) && (
                  <div className="w-2 h-2 rounded-full bg-theme-accent-primary" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
