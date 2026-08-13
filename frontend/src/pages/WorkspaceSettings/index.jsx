import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Workspace from "@/models/workspace";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { isMobile } from "react-device-detect";
import SettingsPageLoadingShell from "@/components/SettingsPageLoadingShell";
import {
  ArrowUUpLeft,
  ChatText,
  Database,
  Robot,
  Sparkle,
  User,
  Wrench,
  ChartBar,
  Clock,
  Folder,
  TextT,
} from "@phosphor-icons/react";
import paths from "@/utils/paths";
import { Link } from "react-router-dom";
import { NavLink } from "react-router-dom";
import { preloadRoute } from "@/utils/settingsRoutePreload";
import GeneralAppearance from "./GeneralAppearance";
import ChatSettings from "./ChatSettings";
import VectorDatabase from "./VectorDatabase";
import Members from "./Members";
import WorkspaceAgentConfiguration from "./AgentConfig";
import Assistants from "./Assistants";
import AnalysisFiles from "./AnalysisFiles";
import ScheduledTasks from "./ScheduledTasks";
import Episodes from "./Episodes";
import OCRConfig from "./OCRConfig";
import useUser from "@/hooks/useUser";
import { useTranslation } from "react-i18next";
import System from "@/models/system";

const TABS = {
  "general-appearance": GeneralAppearance,
  "chat-settings": ChatSettings,
  "vector-database": VectorDatabase,
  members: Members,
  "agent-config": WorkspaceAgentConfiguration,
  assistants: Assistants,
  "analysis-files": AnalysisFiles,
  "scheduled-tasks": ScheduledTasks,
  episodes: Episodes,
  "ocr-config": OCRConfig,
};

export default function WorkspaceSettings() {
  const { loading, requiresAuth, mode } = usePasswordModal();

  if (loading) return <WorkspaceSettingsLoadingShell />;
  if (requiresAuth !== false) {
    return <>{requiresAuth !== null && <PasswordModal mode={mode} />}</>;
  }

  return <ShowWorkspaceChat />;
}

function ShowWorkspaceChat() {
  const { t } = useTranslation();
  const { slug, tab } = useParams();
  const { user } = useUser();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getWorkspace() {
      if (!slug) return;
      const _workspace = await Workspace.bySlug(slug);
      if (!_workspace) {
        setLoading(false);
        return;
      }

      const _settings = await System.keys();
      const suggestedMessages = await Workspace.getSuggestedMessages(slug);
      setWorkspace({
        ..._workspace,
        vectorDB: _settings?.VectorDB,
        suggestedMessages,
      });
      setLoading(false);
    }
    getWorkspace();
  }, [slug, tab]);

  if (loading) return <WorkspaceSettingsLoadingShell />;

  const TabContent = TABS[tab];
  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      {!isMobile && <Sidebar />}
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="transition-all duration-500 relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll"
      >
        <div className="pt-6 pb-4 ml-16 mr-8 border-b-2 border-white light:border-theme-chat-input-border border-opacity-10">
          <Link
            to={paths.workspace.chat(slug)}
            onFocus={() => preloadRoute(paths.workspace.chat(slug))}
            onMouseEnter={() => preloadRoute(paths.workspace.chat(slug))}
            onPointerDown={() => preloadRoute(paths.workspace.chat(slug))}
            onTouchStart={() => preloadRoute(paths.workspace.chat(slug))}
            className="absolute top-2 left-2 md:top-4 md:left-4 transition-all duration-300 p-2 rounded-full text-theme-text-primary bg-theme-sidebar-footer-icon hover:bg-theme-sidebar-footer-icon-hover z-10"
          >
            <ArrowUUpLeft className="h-5 w-5" weight="fill" />
          </Link>

          {/* 第一行：基础设置 */}
          <div className="flex gap-x-6 mb-4">
            <TabItem
              title={t("workspaces—settings.general")}
              icon={<Wrench className="h-5 w-5" />}
              to={paths.workspace.settings.generalAppearance(slug)}
            />
            <TabItem
              title={t("workspaces—settings.chat")}
              icon={<ChatText className="h-5 w-5" />}
              to={paths.workspace.settings.chatSettings(slug)}
            />
            <TabItem
              title={t("workspaces—settings.vector")}
              icon={<Database className="h-5 w-5" />}
              to={paths.workspace.settings.vectorDatabase(slug)}
            />
            <span className="border-l border-theme-border-medium mx-2" />
            <TabItem
              title={t("workspaces—settings.members")}
              icon={<User className="h-5 w-5" />}
              to={paths.workspace.settings.members(slug)}
              visible={["admin", "manager"].includes(user?.role)}
            />
            <TabItem
              title={t("workspaces—settings.agent")}
              icon={<Robot className="h-5 w-5" />}
              to={paths.workspace.settings.agentConfig(slug)}
            />
          </div>

          {/* 第二行：高级功能 */}
          <div className="flex gap-x-6">
            <TabItem
              title="助手"
              icon={<Sparkle className="h-5 w-5" />}
              to={paths.workspace.settings.assistants(slug)}
            />
            <TabItem
              title="分析文件"
              icon={<ChartBar className="h-5 w-5" />}
              to={paths.workspace.settings.analysisFiles(slug)}
            />
            <TabItem
              title="定时任务"
              icon={<Clock className="h-5 w-5" />}
              to={paths.workspace.settings.scheduledTasks(slug)}
            />
            <TabItem
              title="项目"
              icon={<Folder className="h-5 w-5" />}
              to={paths.workspace.settings.episodes(slug)}
            />
            <span className="border-l border-theme-border-medium mx-2" />
            <TabItem
              title="OCR 配置"
              icon={<TextT className="h-5 w-5" />}
              to={paths.workspace.settings.ocrConfig(slug)}
              visible={["admin", "manager"].includes(user?.role)}
            />
          </div>
        </div>
        <div className="px-16 py-6">
          <TabContent slug={slug} workspace={workspace} />
        </div>
      </div>
    </div>
  );
}

function WorkspaceSettingsLoadingShell() {
  return (
    <SettingsPageLoadingShell
      sidebar={!isMobile && <Sidebar />}
      rootClassName="w-screen h-screen overflow-hidden bg-page-texture flex"
      contentClassName="bg-theme-bg-secondary"
    />
  );
}

function TabItem({ title, icon, to, visible = true }) {
  if (!visible) return null;
  const handleIntent = () => preloadRoute(to);

  return (
    <NavLink
      to={to}
      onFocus={handleIntent}
      onMouseEnter={handleIntent}
      onPointerDown={handleIntent}
      onTouchStart={handleIntent}
      className={({ isActive }) =>
        `${
          isActive
            ? "text-sky-400 bg-sky-400/10 rounded-lg px-3 py-1.5"
            : "text-white/60 hover:text-sky-400 hover:bg-white/5 rounded-lg px-3 py-1.5"
        } ` +
        " flex gap-x-2 items-center font-medium text-sm whitespace-nowrap transition-all duration-200"
      }
    >
      {icon}
      <div>{title}</div>
    </NavLink>
  );
}
