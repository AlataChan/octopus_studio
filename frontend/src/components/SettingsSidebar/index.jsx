import React, { useEffect, useRef, useState } from "react";
import OctopusLogoIconOrange from "@/media/logo/octopus-studio-icon-orange.png";
import OctopusLogoIconNavy from "@/media/logo/octopus-studio-icon-navy.png";
import paths from "@/utils/paths";
import useLogo from "@/hooks/useLogo";
import {
  House,
  List,
  Robot,
  Heart,
  Gear,
  UserCircleGear,
  PencilSimpleLine,
  Nut,
  Toolbox,
  Wallet,
} from "@phosphor-icons/react";
import useUser from "@/hooks/useUser";
import { isMobile } from "react-device-detect";
import Footer from "../Footer";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import System from "@/models/system";
import { CHANNEL_PLATFORM_LABELS } from "@/utils/channelPlatformLabels";
import Option from "./MenuOption";
import { CanViewChatHistoryProvider } from "../CanViewChatHistory";
import useAppVersion from "@/hooks/useAppVersion";
import { preloadRoute } from "@/utils/settingsRoutePreload";
import { SHOW_COMPATIBILITY_NAVIGATION } from "@/utils/studioSurfacePolicy";

const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === "true";

export default function SettingsSidebar() {
  const { t } = useTranslation();
  const { logo, isCustomLogo } = useLogo();
  const { user } = useUser();
  const sidebarRef = useRef(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showBgOverlay, setShowBgOverlay] = useState(false);

  useEffect(() => {
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

  if (isMobile) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-10 flex justify-between items-center px-4 py-2 bg-theme-bg-sidebar light:bg-white text-theme-text-secondary shadow-lg h-16">
          <button
            onClick={() => setShowSidebar(true)}
            className="rounded-md p-2 flex items-center justify-center text-theme-text-secondary"
          >
            <List className="h-6 w-6" />
          </button>
          <div className="flex items-center justify-center flex-grow">
            <img
              src={logo}
              alt="Logo"
              className="block mx-auto h-6 w-auto"
              style={{ maxHeight: "40px", objectFit: "contain" }}
            />
          </div>
          <div className="w-12"></div>
        </div>
        <div
          style={{
            transform: showSidebar ? `translateX(0vw)` : `translateX(-100vw)`,
          }}
          className={`z-99 fixed top-0 left-0 transition-all duration-500 w-[100vw] h-[100vh]`}
        >
          <div
            className={`${
              showBgOverlay
                ? "transition-all opacity-1"
                : "transition-none opacity-0"
            }  duration-500 fixed top-0 left-0 bg-theme-bg-secondary bg-opacity-75 w-screen h-screen`}
            onClick={() => setShowSidebar(false)}
          />
          <div
            ref={sidebarRef}
            className="h-[100vh] fixed top-0 left-0 rounded-r-[26px] bg-theme-bg-sidebar w-[80%] p-[18px]"
          >
            <div className="w-full h-full flex flex-col overflow-x-hidden items-between">
              {/* Header Information */}
              <div className="flex w-full items-center justify-between gap-x-4">
                <div className="flex shrink-1 w-fit items-center justify-start">
                  <img
                    src={logo}
                    alt="Logo"
                    className="rounded w-full max-h-[40px]"
                    style={{ objectFit: "contain" }}
                  />
                </div>
                <div className="flex gap-x-2 items-center text-slate-500 shrink-0">
                  <a
                    href={paths.home()}
                    {...routeIntentProps(paths.home())}
                    className="transition-all duration-300 p-2 rounded-full text-theme-text-primary bg-theme-action-menu-bg hover:bg-theme-action-menu-item-hover hover:border-slate-100 hover:border-opacity-50 border-transparent border"
                  >
                    <House className="h-4 w-4" />
                  </a>
                </div>
              </div>

              {/* Primary Body */}
              <div className="h-full flex flex-col w-full justify-between pt-4 overflow-y-scroll no-scroll">
                <div className="h-auto md:sidebar-items">
                  <div className="flex flex-col gap-y-4 pb-[60px] overflow-y-scroll no-scroll">
                    <SidebarOptions user={user} t={t} />
                    <div className="h-[1px] bg-theme-border-subtle mx-3 mt-[14px]" />
                    <SupportEmail />
                    <Link
                      hidden={
                        user?.hasOwnProperty("role") && user.role !== "admin"
                      }
                      to={paths.settings.privacy()}
                      {...routeIntentProps(paths.settings.privacy())}
                      className="text-theme-text-secondary hover:text-theme-text-primary text-xs leading-[18px] mx-3"
                    >
                      {t("settings.privacy")}
                    </Link>
                    <AppVersion />
                  </div>
                </div>
              </div>
              <div className="absolute bottom-2 left-0 right-0 pt-2 bg-theme-bg-sidebar bg-opacity-80 backdrop-filter backdrop-blur-md">
                <Footer />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="relative z-[1] h-full overflow-hidden">
        <div
          ref={sidebarRef}
          className="transition-all duration-500 relative h-full border-r border-theme-sidebar-border bg-theme-bg-sidebar min-w-[250px] p-[10px]"
        >
          <div className="flex flex-col h-full min-w-[235px]">
            {/* Header: Home Link + Title */}
            <div className="flex shrink-0 flex-col px-2 mb-4">
              <Link
                to={paths.home()}
                {...routeIntentProps(paths.home())}
                className="flex items-center justify-start py-4"
              >
                {isCustomLogo ? (
                  <img
                    src={logo}
                    alt="Octopus Studio"
                    className="rounded object-contain"
                    style={{
                      height: "32px",
                      width: "auto",
                      maxWidth: "100%",
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
              <div className="text-theme-text-secondary text-[11px] font-semibold uppercase tracking-wider mt-2 px-1">
                {t("settings.title")}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scroll px-1">
              <div className="flex flex-col gap-y-2">
                <SidebarOptions user={user} t={t} />
                <div className="h-[1px] bg-theme-border-subtle mx-3 my-4" />
                <SupportEmail />
                <Link
                  hidden={user?.hasOwnProperty("role") && user.role !== "admin"}
                  to={paths.settings.privacy()}
                  {...routeIntentProps(paths.settings.privacy())}
                  className="text-theme-text-secondary hover:text-theme-text-primary text-xs leading-[18px] mx-3"
                >
                  {t("settings.privacy")}
                </Link>
                <AppVersion />
              </div>
            </div>

            {/* Pinned Footer */}
            <div className="shrink-0 border-t border-theme-border-subtle pt-3 pb-2 mt-2 bg-theme-bg-sidebar">
              <Footer />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function routeIntentProps(href) {
  return {
    onFocus: () => preloadRoute(href),
    onMouseEnter: () => preloadRoute(href),
    onPointerDown: () => preloadRoute(href),
    onTouchStart: () => preloadRoute(href),
  };
}

function SupportEmail() {
  const [supportEmail, setSupportEmail] = useState(paths.mailToMintplex());
  const { t } = useTranslation();

  useEffect(() => {
    const fetchSupportEmail = async () => {
      const supportEmail = await System.fetchSupportEmail();
      setSupportEmail(
        supportEmail?.email
          ? `mailto:${supportEmail.email}`
          : paths.mailToMintplex()
      );
    };
    fetchSupportEmail();
  }, []);

  return (
    <Link
      to={supportEmail}
      className="text-theme-text-secondary hover:text-theme-text-primary hover:light:text-theme-text-primary text-xs leading-[18px] mx-3 mt-1"
    >
      {t("settings.contact")}
    </Link>
  );
}

const SidebarOptions = ({ user = null, t }) => (
  <CanViewChatHistoryProvider>
    {({ viewable: canViewChatHistory }) => (
      <>
        <Option
          btnText={t("settings.ai-providers")}
          icon={<Gear className="h-5 w-5 flex-shrink-0" />}
          user={user}
          childOptions={[
            {
              btnText: t("settings.llm"),
              href: paths.settings.llmPreference(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: t("settings.vector-database"),
              href: paths.settings.vectorDatabase(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: t("settings.embedder"),
              href: paths.settings.embedder.modelPreference(),
              flex: true,
              roles: ["admin"],
            },
            {
              hidden: !SHOW_COMPATIBILITY_NAVIGATION,
              btnText: t("settings.voice-speech"),
              href: paths.settings.audioPreference(),
              flex: true,
              roles: ["admin"],
            },
            {
              hidden: !SHOW_COMPATIBILITY_NAVIGATION,
              btnText: t("settings.transcription"),
              href: paths.settings.transcriptionPreference(),
              flex: true,
              roles: ["admin"],
            },
          ]}
        />
        <Option
          btnText={t("settings.admin")}
          icon={<UserCircleGear className="h-5 w-5 flex-shrink-0" />}
          user={user}
          childOptions={[
            {
              btnText: t("settings.users"),
              href: paths.settings.users(),
              roles: ["admin", "manager"],
            },
            {
              btnText: t("settings.workspaces"),
              href: paths.settings.workspaces(),
              roles: ["admin", "manager"],
            },
            {
              hidden: !SHOW_COMPATIBILITY_NAVIGATION || !canViewChatHistory,
              btnText: t("settings.workspace-chats"),
              href: paths.settings.chats(),
              flex: true,
              roles: ["admin", "manager"],
            },
            {
              hidden: !SHOW_COMPATIBILITY_NAVIGATION,
              btnText: t("settings.invites"),
              href: paths.settings.invites(),
              roles: ["admin", "manager"],
            },
            {
              hidden: !SHOW_COMPATIBILITY_NAVIGATION,
              btnText: t("settings.observability"),
              href: paths.settings.observability(),
              roles: ["admin", "manager"],
            },
            {
              hidden: !SHOW_COMPATIBILITY_NAVIGATION,
              btnText: CHANNEL_PLATFORM_LABELS.integration,
              href: paths.settings.imGateway(),
              roles: ["admin"],
            },
            {
              hidden: !SHOW_COMPATIBILITY_NAVIGATION,
              btnText: CHANNEL_PLATFORM_LABELS.runtimeOps,
              href: paths.openClaw.index(),
              roles: ["admin"],
            },
            {
              hidden: !SHOW_COMPATIBILITY_NAVIGATION,
              btnText: "SGA-Molt 控制台",
              href: paths.settings.sga(),
              roles: ["admin"],
            },
            {
              hidden: !SHOW_COMPATIBILITY_NAVIGATION || !BILLING_ENABLED,
              btnText: t("settings.billing"),
              href: paths.settings.billing(),
              roles: ["admin"],
            },
          ]}
        />
        <Option
          hidden={!SHOW_COMPATIBILITY_NAVIGATION}
          btnText={t("settings.agent-skills")}
          icon={<Robot className="h-5 w-5 flex-shrink-0" />}
          href={paths.settings.agentSkills()}
          user={user}
          flex={true}
          roles={["admin"]}
        />
        {/* Community Hub 已隐藏 - Octopus Studio 不需要此功能 */}
        {/* <Option
          btnText="Community Hub"
          icon={<Globe className="h-5 w-5 flex-shrink-0" />}
          childOptions={[
            {
              btnText: "Explore Trending",
              href: paths.communityHub.trending(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: "Your Account",
              href: paths.communityHub.authentication(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: "Import Item",
              href: paths.communityHub.importItem(),
              flex: true,
              roles: ["admin"],
            },
          ]}
        /> */}
        <Option
          hidden={!SHOW_COMPATIBILITY_NAVIGATION}
          btnText={t("settings.customization")}
          icon={<PencilSimpleLine className="h-5 w-5 flex-shrink-0" />}
          user={user}
          childOptions={[
            {
              btnText: t("settings.interface"),
              href: paths.settings.interface(),
              flex: true,
              roles: ["admin", "manager"],
            },
            {
              btnText: t("settings.branding"),
              href: paths.settings.branding(),
              flex: true,
              roles: ["admin", "manager"],
            },
            {
              btnText: t("settings.chat"),
              href: paths.settings.chat(),
              flex: true,
              roles: ["admin", "manager"],
            },
          ]}
        />
        <Option
          hidden={!SHOW_COMPATIBILITY_NAVIGATION}
          btnText={t("settings.tools")}
          icon={<Toolbox className="h-5 w-5 flex-shrink-0" />}
          user={user}
          childOptions={[
            {
              hidden: !canViewChatHistory,
              btnText: t("settings.embeds"),
              href: paths.settings.embedChatWidgets(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: t("settings.event-logs"),
              href: paths.settings.logs(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: t("settings.api-keys"),
              href: paths.settings.apiKeys(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: t("settings.system-prompt-variables"),
              href: paths.settings.systemPromptVariables(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: t("settings.ai-system"),
              href: paths.settings.aiSystem(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: t("settings.knowledge-graph") || "Knowledge Graph",
              href: paths.settings.knowledgeGraph(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: "Work Agent",
              href: paths.settings.workAgent(),
              flex: true,
              roles: ["admin"],
            },
            {
              btnText: t("settings.browser-extension"),
              href: paths.settings.browserExtension(),
              flex: true,
              roles: ["admin", "manager"],
            },
          ]}
        />
        <Option
          btnText={t("settings.security")}
          icon={<Nut className="h-5 w-5 flex-shrink-0" />}
          href={paths.settings.security()}
          user={user}
          flex={true}
          roles={["admin", "manager"]}
          hidden={user?.role}
        />
        <Option
          hidden={!SHOW_COMPATIBILITY_NAVIGATION || !BILLING_ENABLED}
          btnText={t("settings.my-billing")}
          icon={<Wallet className="h-5 w-5 flex-shrink-0" />}
          href={paths.settings.myBilling()}
          user={user}
          flex={true}
        />
        <Option
          hidden={!SHOW_COMPATIBILITY_NAVIGATION}
          btnText={t("settings.acknowledgments") || "致谢"}
          icon={<Heart className="h-5 w-5 flex-shrink-0" />}
          href={paths.settings.acknowledgments()}
          user={user}
          flex={true}
        />
      </>
    )}
  </CanViewChatHistoryProvider>
);

function AppVersion() {
  const { version, isLoading } = useAppVersion();
  if (isLoading) return null;
  return (
    <Link
      to={`https://github.com/Mintplex-Labs/anything-llm/releases/tag/v${version}`}
      target="_blank"
      rel="noreferrer"
      className="text-theme-text-secondary light:opacity-80 opacity-50 text-xs mx-3"
    >
      v{version}
    </Link>
  );
}
