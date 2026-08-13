import React, { lazy, Suspense, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { AuthProvider } from "@/AuthContext";
import PrivateRoute, {
  AdminRoute,
  ManagerRoute,
} from "@/components/PrivateRoute";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import i18n from "./i18n";
import paths from "@/utils/paths";

import { PfpProvider } from "./PfpContext";
import { LogoProvider } from "./LogoContext";
import RouteSkeleton from "@/components/RouteSkeleton";
import { ThemeProvider } from "./ThemeContext";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import { SystemSettingsProvider } from "@/components/contexts/SystemSettingsProvider";
import {
  routeImporters,
  scheduleIdleRoutePreload,
} from "@/utils/routeImporters";

const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === "true";

const Main = lazy(routeImporters.main);
const Login = lazy(routeImporters.login);
const SimpleSSOPassthrough = lazy(routeImporters.simpleSsoPassthrough);
const OnboardingFlow = lazy(routeImporters.onboardingFlow);
const InvitePage = lazy(routeImporters.invitePage);
const WorkspaceChat = lazy(routeImporters.workspaceChat);
const WorkspaceGraph = lazy(routeImporters.workspaceGraph);
const FdeWorkflows = lazy(routeImporters.fdeWorkflows);
const WorkspaceAITeam = lazy(routeImporters.workspaceAiTeam);
const Office = lazy(routeImporters.office);
const VisualProduction = lazy(routeImporters.visualProduction);
const AdminUsers = lazy(routeImporters.adminUsers);
const AdminInvites = lazy(routeImporters.adminInvites);
const AdminWorkspaces = lazy(routeImporters.adminWorkspaces);
const AdminLogs = lazy(routeImporters.adminLogs);
const AdminAgents = lazy(routeImporters.adminAgents);
const AdminObservability = lazy(routeImporters.adminObservability);
const AdminBilling = BILLING_ENABLED
  ? lazy(() => import("@/pages/Admin/Billing"))
  : null;
const ImGatewaySettings = lazy(routeImporters.imGatewaySettings);
const OpenClawPage = lazy(routeImporters.openClaw);
const DocumentManager = lazy(routeImporters.documentManager);
const GeneralChats = lazy(routeImporters.generalChats);
const InterfaceSettings = lazy(routeImporters.interfaceSettings);
const BrandingSettings = lazy(routeImporters.brandingSettings);
const ChatSettings = lazy(routeImporters.chatSettings);
const GeneralApiKeys = lazy(routeImporters.generalApiKeys);
const GeneralLLMPreference = lazy(routeImporters.generalLlmPreference);
const GeneralTranscriptionPreference = lazy(
  routeImporters.generalTranscriptionPreference
);
const GeneralAudioPreference = lazy(routeImporters.generalAudioPreference);
const GeneralEmbeddingPreference = lazy(
  routeImporters.generalEmbeddingPreference
);
const GeneralVectorDatabase = lazy(routeImporters.generalVectorDatabase);
const GeneralSecurity = lazy(routeImporters.generalSecurity);
const GeneralBrowserExtension = lazy(routeImporters.generalBrowserExtension);
const WorkspaceSettings = lazy(routeImporters.workspaceSettings);

const ChatEmbedWidgets = lazy(routeImporters.chatEmbedWidgets);
const PrivacyAndData = lazy(routeImporters.privacyAndData);
const Acknowledgments = lazy(routeImporters.acknowledgments);
const AgentBuilder = lazy(routeImporters.agentBuilder);
const CommunityHubTrending = lazy(routeImporters.communityHubTrending);
const CommunityHubAuthentication = lazy(
  routeImporters.communityHubAuthentication
);
const CommunityHubImportItem = lazy(routeImporters.communityHubImportItem);
const SystemPromptVariables = lazy(routeImporters.systemPromptVariables);
const AdminAISystem = lazy(routeImporters.adminAiSystem);
const AdminKnowledgeGraph = lazy(routeImporters.adminKnowledgeGraph);
const AdminWorkAgent = lazy(routeImporters.adminWorkAgent);
const MobileConnections = lazy(routeImporters.mobileConnections);
const MyBilling = BILLING_ENABLED
  ? lazy(() => import("@/pages/GeneralSettings/MyBilling"))
  : null;
const AssistantLibrary = lazy(routeImporters.assistantLibrary);
const CreateAssistant = lazy(routeImporters.createAssistant);

// Skill Hub
const SkillHub = lazy(routeImporters.skillHub);
const SkillDetail = lazy(routeImporters.skillDetail);
const SkillCreate = lazy(routeImporters.skillCreate);
const SkillAutobot = lazy(routeImporters.skillAutobot);

// Molt integration placeholder
const SgaSettings = lazy(routeImporters.sgaSettings);

// 内置文档页面
const CustomSkillsDocs = lazy(routeImporters.customSkillsDocs);
const AgentFlowsDocs = lazy(routeImporters.agentFlowsDocs);
const MCPServersDocs = lazy(routeImporters.mcpServersDocs);

export default function App() {
  useEffect(() => scheduleIdleRoutePreload(), []);

  return (
    <ThemeProvider>
      <Suspense fallback={<RouteSkeleton />}>
        <AuthProvider>
          <SystemSettingsProvider>
            <LogoProvider>
              <PfpProvider>
                <I18nextProvider i18n={i18n}>
                  <Routes>
                    <Route
                      path="/"
                      element={<PrivateRoute Component={Main} />}
                    />
                    <Route path="/login" element={<Login />} />
                    <Route
                      path="/sso/simple"
                      element={<SimpleSSOPassthrough />}
                    />

                    <Route
                      path="/workspace/:slug/settings/:tab"
                      element={<ManagerRoute Component={WorkspaceSettings} />}
                    />
                    <Route
                      path="/workspace/:slug/graph"
                      element={<PrivateRoute Component={WorkspaceGraph} />}
                    />
                    <Route
                      path="/workspace/:slug/fde-workflows"
                      element={<PrivateRoute Component={FdeWorkflows} />}
                    />
                    <Route
                      path="/workspace/:slug/ai-team"
                      element={<PrivateRoute Component={WorkspaceAITeam} />}
                    />
                    <Route
                      path="/office"
                      element={<PrivateRoute Component={Office} />}
                    />
                    <Route
                      path={paths.visualProduction()}
                      element={<ManagerRoute Component={VisualProduction} />}
                    />
                    <Route
                      path="/workspace/:slug"
                      element={<PrivateRoute Component={WorkspaceChat} />}
                    />
                    <Route
                      path="/workspace/:slug/t/:threadSlug"
                      element={<PrivateRoute Component={WorkspaceChat} />}
                    />
                    <Route
                      path="/accept-invite/:code"
                      element={<InvitePage />}
                    />

                    {/* Assistant Library */}
                    <Route
                      path="/assistant-library"
                      element={<PrivateRoute Component={AssistantLibrary} />}
                    />
                    <Route
                      path="/assistant-library/create"
                      element={<AdminRoute Component={CreateAssistant} />}
                    />
                    <Route
                      path="/assistant-library/edit/:id"
                      element={<AdminRoute Component={CreateAssistant} />}
                    />

                    {/* Skill Hub */}
                    <Route
                      path="/skill-hub"
                      element={<PrivateRoute Component={SkillHub} />}
                    />
                    <Route
                      path="/skill-hub/skill/:skillId"
                      element={<PrivateRoute Component={SkillDetail} />}
                    />
                    <Route
                      path="/skill-hub/create"
                      element={<ManagerRoute Component={SkillCreate} />}
                    />
                    <Route
                      path="/skill-hub/autobot"
                      element={<ManagerRoute Component={SkillAutobot} />}
                    />

                    {/* Document Manager */}
                    <Route
                      path="/document-manager"
                      element={<PrivateRoute Component={DocumentManager} />}
                    />

                    {/* Admin */}
                    <Route
                      path="/settings/llm-preference"
                      element={<AdminRoute Component={GeneralLLMPreference} />}
                    />
                    <Route
                      path="/settings/transcription-preference"
                      element={
                        <AdminRoute
                          Component={GeneralTranscriptionPreference}
                        />
                      }
                    />
                    <Route
                      path="/settings/audio-preference"
                      element={
                        <AdminRoute Component={GeneralAudioPreference} />
                      }
                    />
                    <Route
                      path="/settings/embedding-preference"
                      element={
                        <AdminRoute Component={GeneralEmbeddingPreference} />
                      }
                    />
                    {/* 文本分割设置已合并到嵌入器设置页面,保留路由用于向后兼容 */}
                    <Route
                      path="/settings/text-splitter-preference"
                      element={
                        <AdminRoute Component={GeneralEmbeddingPreference} />
                      }
                    />
                    <Route
                      path="/settings/vector-database"
                      element={<AdminRoute Component={GeneralVectorDatabase} />}
                    />
                    <Route
                      path="/settings/agents"
                      element={<AdminRoute Component={AdminAgents} />}
                    />
                    <Route
                      path="/settings/agents/builder"
                      element={
                        <AdminRoute
                          Component={AgentBuilder}
                          hideUserMenu={true}
                        />
                      }
                    />
                    <Route
                      path="/settings/agents/builder/:flowId"
                      element={
                        <AdminRoute
                          Component={AgentBuilder}
                          hideUserMenu={true}
                        />
                      }
                    />
                    <Route
                      path="/settings/event-logs"
                      element={<AdminRoute Component={AdminLogs} />}
                    />
                    <Route
                      path="/settings/observability"
                      element={<AdminRoute Component={AdminObservability} />}
                    />
                    <Route
                      path="/settings/im-gateway"
                      element={<AdminRoute Component={ImGatewaySettings} />}
                    />
                    <Route
                      path="/openclaw"
                      element={<AdminRoute Component={OpenClawPage} />}
                    />
                    <Route
                      path="/settings/embed-chat-widgets"
                      element={<AdminRoute Component={ChatEmbedWidgets} />}
                    />
                    {/* Manager */}
                    <Route
                      path="/settings/security"
                      element={<ManagerRoute Component={GeneralSecurity} />}
                    />
                    <Route
                      path="/settings/privacy"
                      element={<AdminRoute Component={PrivacyAndData} />}
                    />
                    <Route
                      path="/settings/interface"
                      element={<ManagerRoute Component={InterfaceSettings} />}
                    />
                    <Route
                      path="/settings/branding"
                      element={<ManagerRoute Component={BrandingSettings} />}
                    />
                    <Route
                      path="/settings/chat"
                      element={<ManagerRoute Component={ChatSettings} />}
                    />
                    <Route
                      path="/settings/acknowledgments"
                      element={<Acknowledgments />}
                    />
                    <Route
                      path="/settings/api-keys"
                      element={<AdminRoute Component={GeneralApiKeys} />}
                    />
                    <Route
                      path="/settings/system-prompt-variables"
                      element={<AdminRoute Component={SystemPromptVariables} />}
                    />
                    <Route
                      path="/settings/ai-system"
                      element={<AdminRoute Component={AdminAISystem} />}
                    />
                    <Route
                      path="/settings/knowledge-graph"
                      element={<AdminRoute Component={AdminKnowledgeGraph} />}
                    />
                    <Route
                      path="/settings/work-agent"
                      element={<AdminRoute Component={AdminWorkAgent} />}
                    />
                    <Route
                      path="/settings/sga"
                      element={<AdminRoute Component={SgaSettings} />}
                    />
                    <Route
                      path="/settings/browser-extension"
                      element={
                        <ManagerRoute Component={GeneralBrowserExtension} />
                      }
                    />
                    <Route
                      path="/settings/workspace-chats"
                      element={<ManagerRoute Component={GeneralChats} />}
                    />
                    <Route
                      path="/settings/invites"
                      element={<ManagerRoute Component={AdminInvites} />}
                    />
                    <Route
                      path="/settings/users"
                      element={<ManagerRoute Component={AdminUsers} />}
                    />
                    <Route
                      path="/settings/workspaces"
                      element={<ManagerRoute Component={AdminWorkspaces} />}
                    />
                    {BILLING_ENABLED && (
                      <>
                        <Route
                          path="/settings/my-billing"
                          element={<PrivateRoute Component={MyBilling} />}
                        />
                        <Route
                          path="/settings/billing"
                          element={<AdminRoute Component={AdminBilling} />}
                        />
                      </>
                    )}
                    {/* Onboarding Flow */}
                    <Route path="/onboarding" element={<OnboardingFlow />} />
                    <Route
                      path="/onboarding/:step"
                      element={<OnboardingFlow />}
                    />

                    <Route
                      path="/settings/community-hub/trending"
                      element={<AdminRoute Component={CommunityHubTrending} />}
                    />
                    <Route
                      path="/settings/community-hub/authentication"
                      element={
                        <AdminRoute Component={CommunityHubAuthentication} />
                      }
                    />
                    <Route
                      path="/settings/community-hub/import-item"
                      element={
                        <AdminRoute Component={CommunityHubImportItem} />
                      }
                    />

                    <Route
                      path="/settings/mobile-connections"
                      element={<ManagerRoute Component={MobileConnections} />}
                    />

                    {/* 内置文档路由 */}
                    <Route
                      path="/docs/custom-skills"
                      element={<PrivateRoute Component={CustomSkillsDocs} />}
                    />
                    <Route
                      path="/docs/agent-flows"
                      element={<PrivateRoute Component={AgentFlowsDocs} />}
                    />
                    <Route
                      path="/docs/mcp-servers"
                      element={<PrivateRoute Component={MCPServersDocs} />}
                    />
                  </Routes>
                  <ToastContainer />
                  <KeyboardShortcutsHelp />
                </I18nextProvider>
              </PfpProvider>
            </LogoProvider>
          </SystemSettingsProvider>
        </AuthProvider>
      </Suspense>
    </ThemeProvider>
  );
}
