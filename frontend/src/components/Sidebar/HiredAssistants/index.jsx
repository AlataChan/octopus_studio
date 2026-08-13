import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaretDown, CaretRight, Sparkle, X } from "@phosphor-icons/react";
import WorkspaceAssistant, {
  WORKSPACE_ASSISTANTS_UPDATED_EVENT,
} from "@/models/workspaceAssistant";
import AssistantLibrary from "@/models/assistantLibrary";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getLocalStorageItem } from "@/utils/storage";
import { useSidebarData } from "@/contexts/SidebarDataContext";

// 用于记录上次访问的 workspace
const LAST_VISITED_WORKSPACE_KEY = "alata_last_workspace";

export function collectEnabledWorkspaceAssistants(workspaceResults = []) {
  const uniqueAssistantsMap = new Map();

  for (const { workspace, result } of workspaceResults) {
    if (!result?.success || !Array.isArray(result?.data?.assistants)) continue;

    const enabledAssistants = result.data.assistants
      .filter((assistant) => assistant.enabled)
      .map((assistant) => ({
        ...assistant,
        workspaceSlug: workspace.slug,
        workspaceName: workspace.name,
      }));

    for (const assistant of enabledAssistants) {
      const key = assistant.templateId || assistant.id;
      if (!uniqueAssistantsMap.has(key)) {
        uniqueAssistantsMap.set(key, {
          ...assistant,
          workspaces: [
            {
              slug: assistant.workspaceSlug,
              name: assistant.workspaceName,
              instanceId: assistant.id,
            },
          ],
        });
        continue;
      }

      uniqueAssistantsMap.get(key).workspaces.push({
        slug: assistant.workspaceSlug,
        name: assistant.workspaceName,
        instanceId: assistant.id,
      });
    }
  }

  return Array.from(uniqueAssistantsMap.values());
}

export async function getEnabledWorkspaceAssistants(
  workspaces = [],
  options = {}
) {
  const workspaceResults = await Promise.all(
    workspaces.map(async (workspace) => ({
      workspace,
      result: await WorkspaceAssistant.list(workspace.slug, options).catch(
        () => ({
          success: false,
        })
      ),
    }))
  );

  return collectEnabledWorkspaceAssistants(workspaceResults);
}

/**
 * 已聘用员工列表组件
 * 显示所有 workspace 中已启用的 AI 员工
 */
export default function HiredAssistants() {
  const navigate = useNavigate();
  const { workspaces, isLoading: workspacesLoading } = useSidebarData();
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    assistant: null,
    loading: false,
  });

  /**
   * 获取所有 workspace 中已雇佣的助手（去重处理）
   */
  const fetchAllHiredAssistants = useCallback(
    async (options = {}) => {
      if (workspacesLoading) {
        setLoading(true);
        return;
      }

      try {
        setLoading(true);
        setAssistants(await getEnabledWorkspaceAssistants(workspaces, options));
      } catch (error) {
        console.error("获取已雇佣助手失败:", error);
      } finally {
        setLoading(false);
      }
    },
    [workspaces, workspacesLoading]
  );

  useEffect(() => {
    fetchAllHiredAssistants();
  }, [fetchAllHiredAssistants]);

  useEffect(() => {
    function handleWorkspaceAssistantsUpdated(event) {
      const workspaceSlug = event?.detail?.workspaceSlug;
      if (
        workspaceSlug &&
        !workspaces.some((workspace) => workspace.slug === workspaceSlug)
      ) {
        return;
      }

      fetchAllHiredAssistants({ bypassCache: true });
    }

    window.addEventListener(
      WORKSPACE_ASSISTANTS_UPDATED_EVENT,
      handleWorkspaceAssistantsUpdated
    );
    return () => {
      window.removeEventListener(
        WORKSPACE_ASSISTANTS_UPDATED_EVENT,
        handleWorkspaceAssistantsUpdated
      );
    };
  }, [fetchAllHiredAssistants, workspaces]);

  /**
   * 点击助手，跳转到对应的聊天页面
   * 智能选择 workspace：优先使用上次访问的 workspace
   */
  const handleAssistantClick = (assistant) => {
    // 读取上次访问的 workspace
    let lastVisitedSlug = null;
    try {
      const lastVisited = JSON.parse(
        getLocalStorageItem(LAST_VISITED_WORKSPACE_KEY) || "{}"
      );
      lastVisitedSlug = lastVisited.slug;
    } catch (e) {
      // 忽略 JSON 解析错误
    }

    // 找到合适的 workspace 和对应的实例 ID
    let targetWs = assistant.workspaces[0];

    // 如果上次访问的 workspace 包含这个员工，优先使用
    if (lastVisitedSlug && assistant.workspaces) {
      const matchedWs = assistant.workspaces.find(
        (ws) => ws.slug === lastVisitedSlug
      );
      if (matchedWs) {
        targetWs = matchedWs;
      }
    }

    // 跳转到 workspace 聊天页面，并通过 URL 参数传递助手实例 ID
    navigate(
      paths.workspace.chat(targetWs.slug, {
        search: { assistantId: targetWs.instanceId },
      })
    );
  };

  /**
   * 打开解聘确认对话框
   */
  const handleUninstall = (e, assistant) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发跳转
    setConfirmModal({
      isOpen: true,
      assistant,
      loading: false,
    });
  };

  /**
   * 确认解聘助手（从所有 workspace 中解聘）
   */
  const handleConfirmUninstall = async () => {
    const { assistant } = confirmModal;
    if (!assistant || !assistant.workspaces) return;

    setConfirmModal((prev) => ({ ...prev, loading: true }));

    try {
      // 从所有 workspace 中解聘此员工
      const uninstallPromises = assistant.workspaces.map((ws) =>
        WorkspaceAssistant.uninstall(ws.slug, ws.instanceId)
      );
      const results = await Promise.all(uninstallPromises);

      // 检查是否全部成功
      const allSuccess = results.every((r) => r.success);
      if (allSuccess) {
        showToast("解聘成功", "success");
        // 关闭对话框
        setConfirmModal({ isOpen: false, assistant: null, loading: false });
        // 刷新列表
        fetchAllHiredAssistants({ bypassCache: true });
      } else {
        showToast("部分 Workspace 解聘失败", "error");
        setConfirmModal((prev) => ({ ...prev, loading: false }));
        // 仍然刷新列表，显示最新状态
        fetchAllHiredAssistants({ bypassCache: true });
      }
    } catch (error) {
      console.error("解聘助手失败:", error);
      showToast("解聘失败", "error");
      setConfirmModal((prev) => ({ ...prev, loading: false }));
    }
  };

  /**
   * 关闭确认对话框
   */
  const handleCloseConfirmModal = () => {
    if (!confirmModal.loading) {
      setConfirmModal({ isOpen: false, assistant: null, loading: false });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-y-2">
        <div className="flex items-center gap-x-2 px-4 py-2">
          <div className="w-4 h-4 bg-[var(--theme-button-sidebar-bg)] rounded animate-pulse" />
          <div className="h-4 w-24 bg-[var(--theme-button-sidebar-bg)] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (assistants.length === 0) {
    return null; // 没有助手时不显示
  }

  return (
    <div className="flex flex-col gap-y-1">
      {/* 折叠/展开按钮 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-x-2 px-4 py-2 text-theme-text-secondary hover:text-theme-text-primary transition-colors duration-200"
      >
        {isExpanded ? (
          <CaretDown size={14} weight="bold" />
        ) : (
          <CaretRight size={14} weight="bold" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wider">
          AI 团队成员 ({assistants.length})
        </span>
      </button>

      {/* 助手列表 */}
      {isExpanded && (
        <div className="flex flex-col gap-y-1">
          {assistants.map((assistant) => (
            <div key={assistant.id} className="relative group">
              <button
                onClick={() => handleAssistantClick(assistant)}
                className="w-full flex items-center gap-x-2 px-4 py-2 rounded-lg transition-all duration-300 border border-transparent bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover hover:border-[var(--theme-accent-border-soft)] text-theme-text-primary"
                title={`${assistant.instanceName || assistant.template?.employeeName || "员工"} - ${assistant.workspaces?.map((ws) => ws.name).join(", ") || ""}`}
              >
                {/* 员工头像 */}
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-base">
                  {assistant.template?.avatarUrl ? (
                    <img
                      src={AssistantLibrary.getIconUrl(
                        assistant.template.avatarUrl
                      )}
                      alt={assistant.template.employeeName}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    assistant.template?.icon || assistant.icon || "🤖"
                  )}
                </div>

                {/* 员工信息 */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate">
                    {assistant.instanceName ||
                      assistant.template?.employeeName ||
                      assistant.template?.name ||
                      "默认员工"}
                  </div>
                  <div className="text-xs text-theme-text-secondary truncate">
                    {assistant.template?.employeeTitle || "工作区"}
                  </div>
                </div>

                {/* 指示器 */}
                <Sparkle
                  size={14}
                  weight="fill"
                  className="flex-shrink-0 text-theme-accent-primary/60 group-hover:text-theme-accent-primary transition-colors"
                />
              </button>

              {/* 解聘按钮（悬停时显示在右上角）*/}
              <button
                onClick={(e) => handleUninstall(e, assistant)}
                className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-[var(--theme-button-ghost-hover-bg)] rounded-md"
                title="解聘"
              >
                <X
                  size={14}
                  weight="bold"
                  className="text-theme-text-secondary hover:text-theme-text-primary"
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 解聘确认对话框 */}
      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={handleCloseConfirmModal}
        onConfirm={handleConfirmUninstall}
        title="确认解聘"
        message={
          confirmModal.assistant
            ? `确定要解聘"${
                confirmModal.assistant.instanceName ||
                confirmModal.assistant.template?.employeeName ||
                confirmModal.assistant.template?.name ||
                "该员工"
              }"吗？${
                confirmModal.assistant.workspaces?.length > 1
                  ? `（将从 ${confirmModal.assistant.workspaces.length} 个部门同时解聘）`
                  : ""
              }`
            : ""
        }
        description={[
          confirmModal.assistant?.workspaces?.length > 1
            ? `从所有 ${confirmModal.assistant.workspaces.length} 个 Workspace 中移除此员工`
            : "从该 Workspace 中移除此员工",
          "删除该员工的自定义配置",
          "不会删除员工模板，以后可以重新聘用",
        ]}
        confirmText="确认解聘"
        cancelText="取消"
        type="warning"
        loading={confirmModal.loading}
      />
    </div>
  );
}
