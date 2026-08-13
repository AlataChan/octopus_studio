import React, { useCallback, useEffect, useState } from "react";
import QuickLinks from "./QuickLinks";
import Checklist from "./Checklist";
import { isMobile } from "react-device-detect";
import { CHECKLIST_HIDDEN } from "./Checklist/constants";
import Workspace from "@/models/workspace";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ManageWorkspace, {
  useManageWorkspaceModal,
} from "@/components/Modals/ManageWorkspace";
import NewWorkspaceModal, {
  useNewWorkspaceModal,
} from "@/components/Modals/NewWorkspace";
import HomeRightSidebar from "./RightSidebar";
import { getLocalStorageItem } from "@/utils/storage";

const LAST_SELECTED_ASSISTANT_KEY = "alata_last_selected_assistant";

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showModal: showManageWsModal } = useManageWorkspaceModal();
  const {
    showing: showingNewWsModal,
    showModal: showNewWsModal,
    hideModal: hideNewWsModal,
  } = useNewWorkspaceModal();

  // 检查 Checklist 是否被隐藏，以决定布局
  const [checklistHidden, setChecklistHidden] = useState(() => {
    return !!getLocalStorageItem(CHECKLIST_HIDDEN);
  });

  const [loadingAssistants, setLoadingAssistants] = useState(true);
  const [workspaceSlug, setWorkspaceSlug] = useState(null);
  const [assistants, setAssistants] = useState([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);

  // 监听 localStorage 变化（当 Checklist 被关闭时更新布局）
  useEffect(() => {
    const handleStorageChange = () => {
      setChecklistHidden(!!getLocalStorageItem(CHECKLIST_HIDDEN));
    };

    // 使用 MutationObserver 或定时检查，因为同页面 localStorage 变化不触发 storage 事件
    const checkInterval = setInterval(handleStorageChange, 500);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      clearInterval(checkInterval);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // 加载 workspace 和助手列表（Home 主页面共享数据给主区/右侧栏）
  useEffect(() => {
    async function loadData() {
      try {
        const workspaces = await Workspace.all();
        if (workspaces.length === 0) return;

        const firstWorkspace = workspaces[0];
        setWorkspaceSlug(firstWorkspace.slug);

        const res = await WorkspaceAssistant.list(firstWorkspace.slug);
        if (res.success && res.data?.assistants) {
          setAssistants(res.data.assistants);

          const lastSelected = localStorage.getItem(
            LAST_SELECTED_ASSISTANT_KEY
          );
          if (
            lastSelected &&
            res.data.assistants.find((a) => a.id === lastSelected)
          ) {
            setSelectedAssistantId(lastSelected);
          } else if (res.data.assistants.length > 0) {
            setSelectedAssistantId(res.data.assistants[0].id);
          }
        }
      } catch (error) {
        console.error("[Home] Failed to load workspace/assistants:", error);
      } finally {
        setLoadingAssistants(false);
      }
    }
    loadData();
  }, []);

  const handleSelectAssistant = useCallback((assistantId) => {
    setSelectedAssistantId(assistantId);
    if (assistantId) {
      localStorage.setItem(LAST_SELECTED_ASSISTANT_KEY, assistantId);
    } else {
      localStorage.removeItem(LAST_SELECTED_ASSISTANT_KEY);
    }
  }, []);

  const sendChat = useCallback(() => {
    if (!workspaceSlug) {
      showToast(t("main-page.noWorkspaceError"), "warning", { clear: true });
      showNewWsModal();
      return;
    }

    if (selectedAssistantId) {
      navigate(
        `${paths.workspace.chat(workspaceSlug)}?assistant=${selectedAssistantId}`
      );
      return;
    }

    navigate(paths.workspace.chat(workspaceSlug));
  }, [navigate, selectedAssistantId, showNewWsModal, t, workspaceSlug]);

  const embedDocument = useCallback(async () => {
    try {
      const workspaces = await Workspace.all();
      if (workspaces.length === 0) {
        showToast(t("main-page.noWorkspaceError"), "warning", { clear: true });
        showNewWsModal();
        return;
      }
      setSelectedWorkspace(workspaces[0]);
      showManageWsModal();
    } catch (error) {
      console.error("[Home] Failed to open embed modal:", error);
    }
  }, [showManageWsModal, showNewWsModal, t]);

  const createWorkspace = useCallback(() => {
    showNewWsModal();
  }, [showNewWsModal]);

  return (
    <div
      style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
      className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-container w-full h-full"
    >
      <div className="w-full h-full flex overflow-hidden">
        {/* 主区：可滚动内容 */}
        <div className="flex-1 min-w-0 overflow-y-auto no-scroll flex flex-col items-center">
          <div className="w-full max-w-[1200px] flex flex-col gap-y-5 p-4 pt-16 md:p-12 md:pt-11">
            {/* 中间：根据 Checklist 显示状态调整布局 */}
            {checklistHidden ? (
              // Checklist 隐藏时：QuickLinks 全宽
              <QuickLinks
                loading={loadingAssistants}
                assistants={assistants}
                selectedAssistantId={selectedAssistantId}
                onSelectAssistant={handleSelectAssistant}
              />
            ) : (
              // Checklist 显示时：左右两栏布局
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* 左侧：员工选择 + 任务入口 (2/3 宽度) */}
                <div className="lg:col-span-2">
                  <QuickLinks
                    loading={loadingAssistants}
                    assistants={assistants}
                    selectedAssistantId={selectedAssistantId}
                    onSelectAssistant={handleSelectAssistant}
                  />
                </div>
                {/* 右侧：配置向导 (1/3 宽度) */}
                <div className="lg:col-span-1">
                  <Checklist />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧栏：桌面端显示 */}
        {!isMobile && (
          <HomeRightSidebar
            workspaceSlug={workspaceSlug}
            onChat={sendChat}
            onNewKnowledge={embedDocument}
            onNewWork={createWorkspace}
          />
        )}
      </div>

      {selectedWorkspace && (
        <ManageWorkspace
          providedSlug={selectedWorkspace.slug}
          hideModal={() => setSelectedWorkspace(null)}
        />
      )}
      {showingNewWsModal && <NewWorkspaceModal hideModal={hideNewWsModal} />}
    </div>
  );
}
