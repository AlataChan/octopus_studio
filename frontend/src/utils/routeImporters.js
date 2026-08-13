const routeImporterFactories = {
  main: () => import("@/pages/Main"),
  login: () => import("@/pages/Login"),
  simpleSsoPassthrough: () => import("@/pages/Login/SSO/simple"),
  onboardingFlow: () => import("@/pages/OnboardingFlow"),
  invitePage: () => import("@/pages/Invite"),
  workspaceChat: () => import("@/pages/WorkspaceChat"),
  fdeWorkflows: () => import("@/pages/FdeWorkflows"),
  workspaceGraph: () => import("@/pages/WorkspaceGraph"),
  workspaceAiTeam: () => import("@/pages/WorkspaceAITeam"),
  office: () => import("@/pages/Office"),
  visualProduction: () => import("@/pages/VisualProduction"),
  adminUsers: () => import("@/pages/Admin/Users"),
  adminInvites: () => import("@/pages/Admin/Invitations"),
  adminWorkspaces: () => import("@/pages/Admin/Workspaces"),
  adminLogs: () => import("@/pages/Admin/Logging"),
  adminAgents: () => import("@/pages/Admin/Agents"),
  adminObservability: () => import("@/pages/Admin/Observability"),
  imGatewaySettings: () => import("@/pages/Admin/ImGateway"),
  openClaw: () => import("@/pages/OpenClaw"),
  documentManager: () => import("@/pages/DocumentManager"),
  generalChats: () => import("@/pages/GeneralSettings/Chats"),
  interfaceSettings: () => import("@/pages/GeneralSettings/Settings/Interface"),
  brandingSettings: () => import("@/pages/GeneralSettings/Settings/Branding"),
  chatSettings: () => import("@/pages/GeneralSettings/Settings/Chat"),
  generalApiKeys: () => import("@/pages/GeneralSettings/ApiKeys"),
  generalLlmPreference: () => import("@/pages/GeneralSettings/LLMPreference"),
  generalTranscriptionPreference: () =>
    import("@/pages/GeneralSettings/TranscriptionPreference"),
  generalAudioPreference: () =>
    import("@/pages/GeneralSettings/AudioPreference"),
  generalEmbeddingPreference: () =>
    import("@/pages/GeneralSettings/EmbeddingPreference"),
  generalVectorDatabase: () => import("@/pages/GeneralSettings/VectorDatabase"),
  generalSecurity: () => import("@/pages/GeneralSettings/Security"),
  generalBrowserExtension: () =>
    import("@/pages/GeneralSettings/BrowserExtensionApiKey"),
  workspaceSettings: () => import("@/pages/WorkspaceSettings"),
  chatEmbedWidgets: () => import("@/pages/GeneralSettings/ChatEmbedWidgets"),
  privacyAndData: () => import("@/pages/GeneralSettings/PrivacyAndData"),
  acknowledgments: () => import("@/pages/Admin/Acknowledgments"),
  agentBuilder: () => import("@/pages/Admin/AgentBuilder"),
  communityHubTrending: () =>
    import("@/pages/GeneralSettings/CommunityHub/Trending"),
  communityHubAuthentication: () =>
    import("@/pages/GeneralSettings/CommunityHub/Authentication"),
  communityHubImportItem: () =>
    import("@/pages/GeneralSettings/CommunityHub/ImportItem"),
  systemPromptVariables: () => import("@/pages/Admin/SystemPromptVariables"),
  adminAiSystem: () => import("@/pages/Admin/AISystem"),
  adminKnowledgeGraph: () => import("@/pages/Admin/KnowledgeGraph"),
  adminWorkAgent: () => import("@/pages/Admin/WorkAgent"),
  mobileConnections: () => import("@/pages/GeneralSettings/MobileConnections"),
  assistantLibrary: () => import("@/pages/AssistantLibrary"),
  createAssistant: () => import("@/pages/AssistantLibrary/CreateAssistant"),
  skillHub: () => import("@/pages/SkillHub"),
  skillDetail: () => import("@/pages/SkillHub/SkillDetail"),
  skillCreate: () => import("@/pages/SkillHub/SkillCreate"),
  skillAutobot: () => import("@/pages/SkillHub/SkillAutobot"),
  sgaSettings: () => import("@/pages/Admin/SgaSettings"),
  customSkillsDocs: () => import("@/pages/Docs/CustomSkills"),
  agentFlowsDocs: () => import("@/pages/Docs/AgentFlows"),
  mcpServersDocs: () => import("@/pages/Docs/MCPServers"),
};

const importerPromises = new Map();

function memoizedImporter(key, importer) {
  return () => {
    if (!importerPromises.has(key)) {
      importerPromises.set(
        key,
        importer().catch((error) => {
          importerPromises.delete(key);
          throw error;
        })
      );
    }

    return importerPromises.get(key);
  };
}

export const routeImporters = Object.fromEntries(
  Object.entries(routeImporterFactories).map(([key, importer]) => [
    key,
    memoizedImporter(key, importer),
  ])
);

const baseIdleRouteImporterKeys = [
  "office",
  "visualProduction",
  "workspaceChat",
  "workspaceGraph",
  "workspaceAiTeam",
  "documentManager",
  "assistantLibrary",
  "skillHub",
  "skillDetail",
  "skillCreate",
  "skillAutobot",
  "workspaceSettings",
  "generalChats",
  "generalLlmPreference",
  "generalTranscriptionPreference",
  "generalAudioPreference",
  "generalEmbeddingPreference",
  "generalVectorDatabase",
  "generalSecurity",
  "generalBrowserExtension",
  "interfaceSettings",
  "brandingSettings",
  "chatSettings",
  "generalApiKeys",
  "chatEmbedWidgets",
  "privacyAndData",
  "mobileConnections",
  "adminAgents",
  "agentBuilder",
  "adminUsers",
  "adminInvites",
  "adminWorkspaces",
  "adminLogs",
  "adminObservability",
  "imGatewaySettings",
  "openClaw",
  "acknowledgments",
  "systemPromptVariables",
  "adminAiSystem",
  "adminKnowledgeGraph",
  "adminWorkAgent",
  "sgaSettings",
  "communityHubTrending",
  "communityHubAuthentication",
  "communityHubImportItem",
  "main",
  "login",
  "simpleSsoPassthrough",
  "onboardingFlow",
  "invitePage",
  "createAssistant",
  "customSkillsDocs",
  "agentFlowsDocs",
  "mcpServersDocs",
];

export const idleRouteImporterKeys = baseIdleRouteImporterKeys;

function getConnection() {
  if (typeof navigator === "undefined") return null;
  return (
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection
  );
}

export function shouldSkipIdleRoutePrefetch() {
  const connection = getConnection();
  if (!connection) return false;
  if (connection.saveData === true) return true;

  const effectiveType = String(connection.effectiveType || "").toLowerCase();
  return effectiveType.includes("2g");
}

function requestIdleWork(callback) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    return {
      type: "idle",
      id: window.requestIdleCallback(callback, { timeout: 200 }),
    };
  }

  return {
    type: "timeout",
    id: window.setTimeout(
      () => callback({ didTimeout: true, timeRemaining: () => 0 }),
      200
    ),
  };
}

function cancelIdleWork(handle) {
  if (!handle || typeof window === "undefined") return;

  if (handle.type === "idle" && "cancelIdleCallback" in window) {
    window.cancelIdleCallback(handle.id);
    return;
  }

  window.clearTimeout(handle.id);
}

export function scheduleIdleRoutePreload({
  keys = idleRouteImporterKeys,
  concurrency = 2,
} = {}) {
  if (typeof window === "undefined") return () => {};
  if (shouldSkipIdleRoutePrefetch()) return () => {};

  const queue = keys.filter((key) => typeof routeImporters[key] === "function");
  const batchSize = Math.max(1, Number(concurrency) || 1);
  let cancelled = false;
  let idleHandle = null;
  let cursor = 0;

  const scheduleNextBatch = () => {
    if (cancelled || cursor >= queue.length) return;

    idleHandle = requestIdleWork(() => {
      if (cancelled) return;

      const batch = queue.slice(cursor, cursor + batchSize);
      cursor += batch.length;

      Promise.allSettled(batch.map((key) => routeImporters[key]())).finally(
        scheduleNextBatch
      );
    });
  };

  scheduleNextBatch();

  return () => {
    cancelled = true;
    cancelIdleWork(idleHandle);
  };
}

export function __resetRouteImportersForTest() {
  importerPromises.clear();
}
