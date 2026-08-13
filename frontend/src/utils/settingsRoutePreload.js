import { routeImporters } from "@/utils/routeImporters";

const routePreloaders = {
  "/login": routeImporters.login,
  "/sso/simple": routeImporters.simpleSsoPassthrough,
  "/onboarding": routeImporters.onboardingFlow,
  "/accept-invite": routeImporters.invitePage,
  "/settings/llm-preference": routeImporters.generalLlmPreference,
  "/settings/transcription-preference":
    routeImporters.generalTranscriptionPreference,
  "/settings/audio-preference": routeImporters.generalAudioPreference,
  "/settings/embedding-preference": routeImporters.generalEmbeddingPreference,
  "/settings/text-splitter-preference":
    routeImporters.generalEmbeddingPreference,
  "/settings/vector-database": routeImporters.generalVectorDatabase,
  "/settings/agents": routeImporters.adminAgents,
  "/settings/users": routeImporters.adminUsers,
  "/settings/workspaces": routeImporters.adminWorkspaces,
  "/settings/workspace-chats": routeImporters.generalChats,
  "/settings/invites": routeImporters.adminInvites,
  "/settings/observability": routeImporters.adminObservability,
  "/settings/im-gateway": routeImporters.imGatewaySettings,
  "/openclaw": routeImporters.openClaw,
  "/visual": routeImporters.visualProduction,
  "/settings/interface": routeImporters.interfaceSettings,
  "/settings/branding": routeImporters.brandingSettings,
  "/settings/chat": routeImporters.chatSettings,
  "/settings/embed-chat-widgets": routeImporters.chatEmbedWidgets,
  "/settings/event-logs": routeImporters.adminLogs,
  "/settings/api-keys": routeImporters.generalApiKeys,
  "/settings/system-prompt-variables": routeImporters.systemPromptVariables,
  "/settings/ai-system": routeImporters.adminAiSystem,
  "/settings/knowledge-graph": routeImporters.adminKnowledgeGraph,
  "/settings/sga": routeImporters.sgaSettings,
  "/settings/browser-extension": routeImporters.generalBrowserExtension,
  "/settings/security": routeImporters.generalSecurity,
  "/settings/privacy": routeImporters.privacyAndData,
  "/settings/acknowledgments": routeImporters.acknowledgments,
  "/settings/mobile-connections": routeImporters.mobileConnections,
  "/settings/community-hub/trending": routeImporters.communityHubTrending,
  "/settings/community-hub/authentication":
    routeImporters.communityHubAuthentication,
  "/settings/community-hub/import-item": routeImporters.communityHubImportItem,
  "/docs/custom-skills": routeImporters.customSkillsDocs,
  "/docs/agent-flows": routeImporters.agentFlowsDocs,
  "/docs/mcp-servers": routeImporters.mcpServersDocs,
};

const preloadedRoutes = new Set();

const workspaceChatLoader = routeImporters.workspaceChat;
const workspaceGraphLoader = routeImporters.workspaceGraph;
const workspaceOfficeLoader = routeImporters.office;
const visualProductionLoader = routeImporters.visualProduction;
const workspaceAITeamLoader = routeImporters.workspaceAiTeam;
const documentManagerLoader = routeImporters.documentManager;
const workspaceSettingsLoader = routeImporters.workspaceSettings;
const assistantLibraryLoader = routeImporters.assistantLibrary;
const skillHubLoader = routeImporters.skillHub;

export function preloadRouteOnce(key, preload) {
  if (!key || !preload || preloadedRoutes.has(key)) return;

  preloadedRoutes.add(key);
  return preload().catch(() => {
    preloadedRoutes.delete(key);
  });
}

export function preloadWorkspaceChat() {
  return preloadRouteOnce("workspace-chat", workspaceChatLoader);
}

export function preloadWorkspaceGraph() {
  return preloadRouteOnce("workspace-graph", workspaceGraphLoader);
}

export function preloadWorkspaceOffice() {
  return preloadRouteOnce("workspace-office", workspaceOfficeLoader);
}

export function preloadVisualProduction() {
  return preloadRouteOnce("visual-production", visualProductionLoader);
}

export function preloadWorkspaceAITeam() {
  return preloadRouteOnce("workspace-ai-team", workspaceAITeamLoader);
}

export function preloadDocumentManager() {
  return preloadRouteOnce("document-manager", documentManagerLoader);
}

export function preloadAssistantLibrary() {
  return preloadRouteOnce("assistant-library", assistantLibraryLoader);
}

export function preloadSkillHub() {
  return preloadRouteOnce("skill-hub", skillHubLoader);
}

const dynamicRoutePreloaders = [
  {
    key: "workspace-graph",
    pattern: /^\/workspace\/[^/]+\/graph$/,
    preload: workspaceGraphLoader,
  },
  {
    key: "workspace-ai-team",
    pattern: /^\/workspace\/[^/]+\/ai-team$/,
    preload: workspaceAITeamLoader,
  },
  {
    key: "workspace-settings",
    pattern: /^\/workspace\/[^/]+\/settings(?:\/.*)?$/,
    preload: workspaceSettingsLoader,
  },
  {
    key: "workspace-chat",
    pattern: /^\/workspace\/[^/]+(?:\/t\/[^/]+)?$/,
    preload: workspaceChatLoader,
  },
  {
    key: "workspace-office",
    pattern: /^\/office$/,
    preload: workspaceOfficeLoader,
  },
  {
    key: "visual-production",
    pattern: /^\/visual$/,
    preload: visualProductionLoader,
  },
  {
    key: "document-manager",
    pattern: /^\/document-manager$/,
    preload: documentManagerLoader,
  },
  {
    key: "create-assistant",
    pattern: /^\/assistant-library\/(?:create|edit\/[^/]+)$/,
    preload: routeImporters.createAssistant,
  },
  {
    key: "assistant-library",
    pattern: /^\/assistant-library(?:\/.*)?$/,
    preload: assistantLibraryLoader,
  },
  {
    key: "skill-detail",
    pattern: /^\/skill-hub\/skill\/[^/]+$/,
    preload: routeImporters.skillDetail,
  },
  {
    key: "skill-create",
    pattern: /^\/skill-hub\/create$/,
    preload: routeImporters.skillCreate,
  },
  {
    key: "skill-autobot",
    pattern: /^\/skill-hub\/autobot$/,
    preload: routeImporters.skillAutobot,
  },
  {
    key: "skill-hub",
    pattern: /^\/skill-hub(?:\/.*)?$/,
    preload: skillHubLoader,
  },
  {
    key: "agent-builder",
    pattern: /^\/settings\/agents\/builder(?:\/.*)?$/,
    preload: routeImporters.agentBuilder,
  },
  {
    key: "invite-page",
    pattern: /^\/accept-invite\/[^/]+$/,
    preload: routeImporters.invitePage,
  },
  {
    key: "onboarding-flow",
    pattern: /^\/onboarding(?:\/.*)?$/,
    preload: routeImporters.onboardingFlow,
  },
];

function normalizeRouteHref(href) {
  if (!href) return "";

  try {
    const url = new URL(String(href), "http://alata.local");
    return (url.pathname || "/").replace(/\/+$/, "") || "/";
  } catch {
    return String(href).split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  }
}

export function resolveRoutePreloader(href) {
  const normalizedHref = normalizeRouteHref(href);
  const staticPreload = routePreloaders[normalizedHref];
  if (staticPreload) {
    return { key: normalizedHref, preload: staticPreload };
  }

  return (
    dynamicRoutePreloaders.find(({ pattern }) =>
      pattern.test(normalizedHref)
    ) || null
  );
}

export function preloadRoute(href) {
  const routePreloader = resolveRoutePreloader(href);
  if (!routePreloader) return;
  return preloadRouteOnce(routePreloader.key, routePreloader.preload);
}

export function preloadSettingsRoute(href) {
  const preload = routePreloaders[href];
  return preloadRouteOnce(href, preload);
}

export function __resetPreloadedRoutesForTest() {
  preloadedRoutes.clear();
}
