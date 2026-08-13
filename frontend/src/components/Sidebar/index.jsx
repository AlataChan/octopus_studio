import React, { useEffect, useRef, useState } from "react";
import {
  List,
  Plus,
  Sparkle,
  PuzzlePiece,
  Database,
  UsersThree,
  Buildings,
  ImageSquare,
} from "@phosphor-icons/react";
import NewWorkspaceModal, {
  useNewWorkspaceModal,
} from "../Modals/NewWorkspace";
import ActiveWorkspaces from "./ActiveWorkspaces";
import HiredAssistants from "./HiredAssistants";
import useLogo from "@/hooks/useLogo";
import useUser from "@/hooks/useUser";
import Footer from "../Footer";
import SettingsButton from "../SettingsButton";
import { Link, NavLink, useLocation } from "react-router-dom";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";
import { useSidebarToggle, ToggleSidebarButton } from "./SidebarToggle";
import SearchBox from "./SearchBox";
import { Tooltip } from "react-tooltip";
import { createPortal } from "react-dom";
import UserCard from "./UserCard";
import {
  preloadAssistantLibrary,
  preloadDocumentManager,
  preloadSkillHub,
  preloadVisualProduction,
  preloadWorkspaceAITeam,
  preloadWorkspaceOffice,
} from "@/utils/settingsRoutePreload";
import {
  SidebarDataProvider,
  useSidebarData,
} from "@/contexts/SidebarDataContext";
import OctopusLogoIconOrange from "@/media/logo/octopus-studio-icon-orange.png";
import OctopusLogoIconNavy from "@/media/logo/octopus-studio-icon-navy.png";
import { SHOW_COMPATIBILITY_NAVIGATION } from "@/utils/studioSurfacePolicy";

const SIDEBAR_SHELL_CLASS =
  "relative h-full border-r border-theme-sidebar-border bg-theme-bg-sidebar min-w-[250px] p-[10px]";
const SIDEBAR_NAV_ACTIVE_CLASS =
  "border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-primary)]";
const SIDEBAR_NAV_IDLE_CLASS =
  "border border-transparent bg-theme-sidebar-item-default text-theme-text-primary hover:bg-theme-sidebar-item-hover hover:border-[var(--theme-accent-border-soft)] hover:text-theme-text-primary";

function preloadIntentProps(preload) {
  return {
    onFocus: preload,
    onMouseEnter: preload,
    onPointerDown: preload,
    onTouchStart: preload,
  };
}

export default function Sidebar() {
  const { user } = useUser();
  const { logo, isCustomLogo } = useLogo();
  const sidebarRef = useRef(null);
  const { showSidebar, setShowSidebar, canToggleSidebar } = useSidebarToggle();
  const {
    showing: showingNewWsModal,
    showModal: showNewWsModal,
    hideModal: hideNewWsModal,
  } = useNewWorkspaceModal();

  return (
    <SidebarDataProvider>
      <>
        {!showSidebar && canToggleSidebar && (
          <div className="fixed top-0 left-0 z-10 flex items-center h-16 px-4">
            <ToggleSidebarButton
              showSidebar={showSidebar}
              setShowSidebar={setShowSidebar}
            />
          </div>
        )}
        <div
          style={{
            width: showSidebar ? "292px" : "0px",
          }}
          className="relative z-[1] shrink-0 transition-all duration-500 h-full overflow-hidden"
        >
          <div ref={sidebarRef} className={SIDEBAR_SHELL_CLASS}>
            <div className="flex flex-col h-full min-w-[235px]">
              {/* Header: Logo + Toggle */}
              <div className="flex shrink-0 w-full justify-between items-center h-16 px-2 mb-2">
                <Link
                  to={paths.home()}
                  aria-label="Home"
                  className="flex items-center"
                >
                  {isCustomLogo ? (
                    <img
                      src={logo}
                      alt="Octopus Studio"
                      className={`rounded object-contain transition-opacity duration-500 ${showSidebar ? "opacity-100" : "opacity-0"}`}
                      style={{
                        height: "40px",
                        width: "auto",
                        maxWidth: "100%",
                      }}
                    />
                  ) : (
                    <div
                      className={`flex items-center gap-x-2 transition-opacity duration-500 ${showSidebar ? "opacity-100" : "opacity-0"}`}
                    >
                      <img
                        src={OctopusLogoIconOrange}
                        alt="Octopus Studio"
                        className="h-8 w-auto hidden light:block"
                      />
                      <img
                        src={OctopusLogoIconNavy}
                        alt="Octopus Studio"
                        className="h-8 w-auto light:hidden"
                      />
                      <span className="text-theme-text-primary font-semibold text-[17px] tracking-tight">
                        Octopus
                        <span className="text-[var(--theme-accent-primary)]">
                          {" "}
                          Studio
                        </span>
                      </span>
                    </div>
                  )}
                </Link>
                {showSidebar && canToggleSidebar && (
                  <ToggleSidebarButton
                    showSidebar={showSidebar}
                    setShowSidebar={setShowSidebar}
                  />
                )}
              </div>

              {/* User Identity */}
              <div className="shrink-0 mb-4">
                <UserCard />
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 min-h-0 overflow-y-auto no-scroll">
                <div className="flex flex-col gap-y-[14px]">
                  <SearchBox user={user} showNewWsModal={showNewWsModal} />
                  {SHOW_COMPATIBILITY_NAVIGATION && <HiredAssistants />}
                  {SHOW_COMPATIBILITY_NAVIGATION && <AITeamButton />}
                  <KnowledgeBaseButton />
                  <ActiveWorkspaces />
                  {SHOW_COMPATIBILITY_NAVIGATION && <AssistantLibraryButton />}
                  {SHOW_COMPATIBILITY_NAVIGATION && <SkillHubButton />}
                  {SHOW_COMPATIBILITY_NAVIGATION && <VisualProductionButton />}
                  {SHOW_COMPATIBILITY_NAVIGATION && <OfficeButton />}
                </div>
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 border-t border-theme-border-subtle pt-3 pb-2 mt-2 bg-theme-bg-sidebar">
                <Footer />
              </div>
            </div>
          </div>
          {showingNewWsModal && (
            <NewWorkspaceModal hideModal={hideNewWsModal} />
          )}
        </div>
        <WorkspaceAndThreadTooltips />
      </>
    </SidebarDataProvider>
  );
}

export function SidebarMobileHeader() {
  const { logo, isCustomLogo } = useLogo();
  const sidebarRef = useRef(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showBgOverlay, setShowBgOverlay] = useState(false);
  const {
    showing: showingNewWsModal,
    showModal: showNewWsModal,
    hideModal: hideNewWsModal,
  } = useNewWorkspaceModal();
  const { user } = useUser();

  useEffect(() => {
    // Darkens the rest of the screen
    // when sidebar is open.
    function handleBg() {
      if (showSidebar) {
        setTimeout(() => {
          setShowBgOverlay(true);
        }, 300);
      } else {
        setShowBgOverlay(false);
      }
    }
    handleBg();
  }, [showSidebar]);

  return (
    <SidebarDataProvider>
      <>
        <div
          aria-label="Show sidebar"
          className="fixed top-0 left-0 right-0 z-10 flex justify-between items-center px-4 py-2 bg-theme-bg-sidebar text-theme-text-primary shadow-lg h-16"
        >
          <button
            onClick={() => setShowSidebar(true)}
            className="rounded-md p-2 flex items-center justify-center text-theme-text-secondary"
          >
            <List className="h-6 w-6" />
          </button>
          <div className="flex items-center justify-center flex-grow">
            {isCustomLogo ? (
              <img
                src={logo}
                alt="Octopus Studio"
                className="block w-auto"
                style={{
                  height: "36px",
                  maxWidth: "100%",
                  objectFit: "contain",
                }}
              />
            ) : (
              <span className="text-theme-text-primary font-bold text-[19px] tracking-tight">
                Octopus
                <span className="text-[var(--theme-accent-primary)]">
                  {" "}
                  Studio
                </span>
              </span>
            )}
          </div>
          <div className="w-12"></div>
        </div>
        <div
          style={{
            transform: showSidebar ? `translateX(0vw)` : `translateX(-100vw)`,
          }}
          className={`z-modal fixed top-0 left-0 transition-all duration-500 w-[100vw] h-[100vh]`}
        >
          <div
            className={`${
              showBgOverlay
                ? "transition-all opacity-1"
                : "transition-none opacity-0"
            }  duration-500 fixed top-0 left-0 z-overlay bg-theme-bg-secondary bg-opacity-75 w-screen h-screen`}
            onClick={() => setShowSidebar(false)}
          />
          <div
            ref={sidebarRef}
            className="relative h-[100vh] fixed top-0 left-0 rounded-r-[26px] border-r border-theme-sidebar-border bg-theme-bg-sidebar w-[80%] p-[18px] z-modal"
          >
            <div className="w-full h-full flex flex-col overflow-x-hidden items-between">
              {/* Header Information */}
              <div className="flex w-full items-center justify-between gap-x-4">
                <div className="flex shrink-1 w-fit items-center justify-start">
                  {isCustomLogo ? (
                    <img
                      src={logo}
                      alt="Octopus Studio"
                      className="rounded"
                      style={{
                        height: "36px",
                        width: "auto",
                        maxWidth: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <div className="flex items-center gap-x-2">
                      <img
                        src={OctopusLogoIconOrange}
                        alt="Octopus Studio"
                        className="h-8 w-auto hidden light:block"
                      />
                      <img
                        src={OctopusLogoIconNavy}
                        alt="Octopus Studio"
                        className="h-8 w-auto light:hidden"
                      />
                      <span className="text-theme-text-primary font-bold text-[19px] tracking-tight">
                        Octopus
                        <span className="text-[var(--theme-accent-primary)]">
                          {" "}
                          Studio
                        </span>
                      </span>
                    </div>
                  )}
                </div>
                {(!user || user?.role !== "default") && (
                  <div className="flex gap-x-2 items-center text-theme-text-secondary shink-0">
                    <SettingsButton />
                  </div>
                )}
              </div>

              {/* Primary Body */}
              <div className="h-full flex flex-col w-full justify-between pt-4 ">
                <div className="h-auto md:sidebar-items">
                  <div className=" flex flex-col gap-y-4 overflow-y-scroll no-scroll pb-[100px]">
                    {/* 用户卡片 - 移动端 */}
                    <UserCard />

                    <NewWorkspaceButton
                      user={user}
                      showNewWsModal={showNewWsModal}
                    />
                    {SHOW_COMPATIBILITY_NAVIGATION && <HiredAssistants />}
                    {SHOW_COMPATIBILITY_NAVIGATION && <AITeamButton />}
                    <KnowledgeBaseButton />
                    <ActiveWorkspaces />
                    {SHOW_COMPATIBILITY_NAVIGATION && (
                      <AssistantLibraryButton />
                    )}
                    {SHOW_COMPATIBILITY_NAVIGATION && <SkillHubButton />}
                    {SHOW_COMPATIBILITY_NAVIGATION && (
                      <VisualProductionButton />
                    )}
                    {SHOW_COMPATIBILITY_NAVIGATION && <OfficeButton />}
                  </div>
                </div>
                <div className="z-modal absolute bottom-0 left-0 right-0 pt-2 pb-6 rounded-br-[26px] bg-theme-bg-sidebar bg-opacity-80 backdrop-filter backdrop-blur-md">
                  <Footer />
                </div>
              </div>
            </div>
          </div>
          {showingNewWsModal && (
            <NewWorkspaceModal hideModal={hideNewWsModal} />
          )}
        </div>
      </>
    </SidebarDataProvider>
  );
}

function NewWorkspaceButton({ user, showNewWsModal }) {
  const { t } = useTranslation();
  if (!!user && user?.role === "default") return null;

  return (
    <div className="flex gap-x-2 items-center justify-between">
      <button
        onClick={showNewWsModal}
        className="flex flex-grow w-[75%] h-[44px] gap-x-2 py-[5px] px-4 rounded-lg justify-center items-center bg-primary-button text-[var(--theme-button-primary-text)] hover:bg-[var(--theme-button-primary-hover)] transition-all duration-300"
      >
        <Plus className="h-5 w-5" />
        <p className="text-sm font-semibold">{t("new-workspace.title")}</p>
      </button>
    </div>
  );
}

function AssistantLibraryButton() {
  return (
    <NavLink
      to={paths.assistantLibrary()}
      {...preloadIntentProps(preloadAssistantLibrary)}
      className={({ isActive }) =>
        `flex items-center gap-x-2 px-4 py-2.5 rounded-lg transition-all duration-300 ${
          isActive ? SIDEBAR_NAV_ACTIVE_CLASS : SIDEBAR_NAV_IDLE_CLASS
        }`
      }
    >
      <Sparkle size={20} weight="fill" />
      <span className="text-sm font-medium">人才市场</span>
    </NavLink>
  );
}

function SkillHubButton() {
  return (
    <NavLink
      to={paths.skillHub()}
      {...preloadIntentProps(preloadSkillHub)}
      className={({ isActive }) =>
        `flex items-center gap-x-2 px-4 py-2.5 rounded-lg transition-all duration-300 ${
          isActive ? SIDEBAR_NAV_ACTIVE_CLASS : SIDEBAR_NAV_IDLE_CLASS
        }`
      }
    >
      <PuzzlePiece size={20} weight="fill" />
      <span className="text-sm font-medium">技能中心</span>
    </NavLink>
  );
}

function VisualProductionButton() {
  const { t } = useTranslation();

  return (
    <NavLink
      to={paths.visualProduction()}
      {...preloadIntentProps(preloadVisualProduction)}
      className={({ isActive }) =>
        `flex items-center gap-x-2 px-4 py-2.5 rounded-lg transition-all duration-300 ${
          isActive ? SIDEBAR_NAV_ACTIVE_CLASS : SIDEBAR_NAV_IDLE_CLASS
        }`
      }
    >
      <ImageSquare size={20} weight="fill" />
      <span className="text-sm font-medium">
        {t("visualProduction.nav", "视觉生成")}
      </span>
    </NavLink>
  );
}

function OfficeButton() {
  return (
    <NavLink
      to={paths.office()}
      {...preloadIntentProps(preloadWorkspaceOffice)}
      className={({ isActive }) =>
        `flex items-center gap-x-2 px-4 py-2.5 rounded-lg transition-all duration-300 ${
          isActive ? SIDEBAR_NAV_ACTIVE_CLASS : SIDEBAR_NAV_IDLE_CLASS
        }`
      }
    >
      <Buildings size={20} weight="fill" />
      <span className="text-sm font-medium">Office</span>
    </NavLink>
  );
}

/**
 * AI 团队按钮
 * - 优先使用 URL 中的 workspace slug（如果当前在某个 workspace 页面）
 * - 否则使用第一个可用的 workspace
 * - 始终显示按钮，让用户能够快速访问 AI 团队功能
 */
function AITeamButton() {
  const { pathname } = useLocation();
  const { workspaces, isLoading } = useSidebarData();
  const [targetWorkspace, setTargetWorkspace] = useState(null);

  useEffect(() => {
    const pathParts = pathname.split("/");
    const workspaceIndex = pathParts.indexOf("workspace");
    const routeWorkspaceSlug =
      workspaceIndex !== -1 ? pathParts[workspaceIndex + 1] : null;

    if (routeWorkspaceSlug) {
      setTargetWorkspace(routeWorkspaceSlug);
      return;
    }

    setTargetWorkspace(workspaces[0]?.slug ?? null);
  }, [pathname, workspaces]);

  // 加载中或没有可用 workspace 时不显示
  if (isLoading || !targetWorkspace) return null;

  return (
    <NavLink
      to={paths.workspace.aiTeam(targetWorkspace)}
      {...preloadIntentProps(preloadWorkspaceAITeam)}
      className={({ isActive }) =>
        `flex items-center gap-x-2 px-4 py-2.5 rounded-lg transition-all duration-300 ${
          isActive ? SIDEBAR_NAV_ACTIVE_CLASS : SIDEBAR_NAV_IDLE_CLASS
        }`
      }
    >
      <UsersThree size={20} weight="fill" />
      <span className="text-sm font-medium">我的团队</span>
    </NavLink>
  );
}

function KnowledgeBaseButton() {
  return (
    <NavLink
      to={paths.documentManager()}
      {...preloadIntentProps(preloadDocumentManager)}
      className={({ isActive }) =>
        `flex items-center gap-x-2 px-4 py-2.5 rounded-lg transition-all duration-300 ${
          isActive ? SIDEBAR_NAV_ACTIVE_CLASS : SIDEBAR_NAV_IDLE_CLASS
        }`
      }
    >
      <Database size={20} weight="fill" />
      <span className="text-sm font-medium">知识库</span>
    </NavLink>
  );
}

function WorkspaceAndThreadTooltips() {
  return createPortal(
    <React.Fragment>
      <Tooltip
        id="workspace-name"
        place="right"
        delayShow={800}
        className="tooltip !text-xs z-99"
      />
      <Tooltip
        id="workspace-thread-name"
        place="right"
        delayShow={800}
        className="tooltip !text-xs z-99"
      />
    </React.Fragment>,
    document.body
  );
}
