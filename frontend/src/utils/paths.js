import { API_BASE } from "./constants";

const ALATA_REPO_URL = "https://github.com/AlataChan/octopus_studio";

function applyOptions(path, options = {}) {
  let updatedPath = path;
  if (!options || Object.keys(options).length === 0) return updatedPath;

  if (options.search) {
    const searchParams = new URLSearchParams(options.search);
    updatedPath += `?${searchParams.toString()}`;
  }
  return updatedPath;
}

export default {
  home: () => {
    return "/";
  },
  login: (noTry = false) => {
    return `/login${noTry ? "?nt=1" : ""}`;
  },
  sso: {
    login: () => {
      return "/sso/simple";
    },
  },
  onboarding: {
    home: () => {
      return "/onboarding";
    },
    survey: () => {
      return "/onboarding/survey";
    },
    llmPreference: () => {
      return "/onboarding/llm-preference";
    },
    embeddingPreference: () => {
      return "/onboarding/embedding-preference";
    },
    vectorDatabase: () => {
      return "/onboarding/vector-database";
    },
    userSetup: () => {
      return "/onboarding/user-setup";
    },
    dataHandling: () => {
      return "/onboarding/data-handling";
    },
    createWorkspace: () => {
      return "/onboarding/create-workspace";
    },
  },
  github: () => {
    return ALATA_REPO_URL;
  },
  discord: () => {
    return "https://discord.com/invite/6UyHPeGZAC";
  },
  docs: () => {
    return ALATA_REPO_URL;
  },
  chatModes: () => {
    return ALATA_REPO_URL;
  },
  mailToMintplex: () => {
    return "mailto:team@mintplexlabs.com";
  },
  hosting: () => {
    return "https://alata.studio";
  },
  workspace: {
    chat: (slug, options = {}) => {
      return applyOptions(`/workspace/${slug}`, options);
    },
    graph: (slug) => {
      return `/workspace/${slug}/graph`;
    },
    fdeWorkflows: (slug) => {
      return `/workspace/${slug}/fde-workflows`;
    },
    aiTeam: (slug) => {
      return `/workspace/${slug}/ai-team`;
    },
    settings: {
      generalAppearance: (slug) => {
        return `/workspace/${slug}/settings/general-appearance`;
      },
      chatSettings: function (slug, options = {}) {
        return applyOptions(
          `/workspace/${slug}/settings/chat-settings`,
          options
        );
      },
      vectorDatabase: (slug) => {
        return `/workspace/${slug}/settings/vector-database`;
      },
      members: (slug) => {
        return `/workspace/${slug}/settings/members`;
      },
      agentConfig: (slug) => {
        return `/workspace/${slug}/settings/agent-config`;
      },
      assistants: (slug) => {
        return `/workspace/${slug}/settings/assistants`;
      },
      analysisFiles: (slug) => {
        return `/workspace/${slug}/settings/analysis-files`;
      },
      scheduledTasks: (slug) => {
        return `/workspace/${slug}/settings/scheduled-tasks`;
      },
      episodes: (slug) => {
        return `/workspace/${slug}/settings/episodes`;
      },
      ocrConfig: (slug) => {
        return `/workspace/${slug}/settings/ocr-config`;
      },
    },
    thread: (wsSlug, threadSlug) => {
      return `/workspace/${wsSlug}/t/${threadSlug}`;
    },
  },
  apiDocs: () => {
    return `${API_BASE}/docs`;
  },
  assistantLibrary: () => {
    return "/assistant-library";
  },
  skillHub: () => {
    return "/skill-hub";
  },
  skillHubSkill: (skillId) => {
    return `/skill-hub/skill/${encodeURIComponent(skillId)}`;
  },
  skillHubCreate: () => {
    return "/skill-hub/create";
  },
  skillHubAutobot: () => {
    return "/skill-hub/autobot";
  },
  office: () => {
    return "/office";
  },
  createAssistant: () => {
    return "/assistant-library/create";
  },
  editAssistant: (id) => {
    return `/assistant-library/edit/${id}`;
  },
  documentManager: () => {
    return "/document-manager";
  },
  visualProduction: () => {
    return "/visual";
  },
  settings: {
    users: () => {
      return `/settings/users`;
    },
    invites: () => {
      return `/settings/invites`;
    },
    workspaces: () => {
      return `/settings/workspaces`;
    },
    chats: () => {
      return "/settings/workspace-chats";
    },
    llmPreference: () => {
      return "/settings/llm-preference";
    },
    transcriptionPreference: () => {
      return "/settings/transcription-preference";
    },
    audioPreference: () => {
      return "/settings/audio-preference";
    },
    embedder: {
      modelPreference: () => "/settings/embedding-preference",
      chunkingPreference: () => "/settings/text-splitter-preference",
    },
    embeddingPreference: () => {
      return "/settings/embedding-preference";
    },
    vectorDatabase: () => {
      return "/settings/vector-database";
    },
    security: () => {
      return "/settings/security";
    },
    interface: () => {
      return "/settings/interface";
    },
    branding: () => {
      return "/settings/branding";
    },
    agentSkills: () => {
      return "/settings/agents";
    },
    chat: () => {
      return "/settings/chat";
    },
    apiKeys: () => {
      return "/settings/api-keys";
    },
    systemPromptVariables: () => "/settings/system-prompt-variables",
    logs: () => {
      return "/settings/event-logs";
    },
    observability: () => {
      return "/settings/observability";
    },
    privacy: () => {
      return "/settings/privacy";
    },
    embedChatWidgets: () => {
      return `/settings/embed-chat-widgets`;
    },
    browserExtension: () => {
      return `/settings/browser-extension`;
    },
    acknowledgments: () => {
      return `/settings/acknowledgments`;
    },
    mobileConnections: () => {
      return `/settings/mobile-connections`;
    },
    aiSystem: () => {
      return `/settings/ai-system`;
    },
    knowledgeGraph: () => {
      return `/settings/knowledge-graph`;
    },
    workAgent: () => {
      return `/settings/work-agent`;
    },
    imGateway: () => {
      return `/settings/im-gateway`;
    },
    sga: () => {
      return `/settings/sga`;
    },
    billing: () => {
      return `/settings/billing`;
    },
    myBilling: () => {
      return `/settings/my-billing`;
    },
  },
  agents: {
    builder: () => {
      return `/settings/agents/builder`;
    },
    editAgent: (uuid) => {
      return `/settings/agents/builder/${uuid}`;
    },
  },
  communityHub: {
    website: () => {
      return import.meta.env.DEV
        ? `http://localhost:5173`
        : import.meta.env.VITE_COMMUNITY_HUB_URL || ALATA_REPO_URL;
    },
    /**
     * View more items of a given type on the community hub.
     * @param {string} type - The type of items to view more of. Should be kebab-case.
     * @returns {string} The path to view more items of the given type.
     */
    viewMoreOfType: function (type) {
      return `${this.website()}/list/${type}`;
    },
    viewItem: function (type, id) {
      return `${this.website()}/i/${type}/${id}`;
    },
    trending: () => {
      return `/settings/community-hub/trending`;
    },
    authentication: () => {
      return `/settings/community-hub/authentication`;
    },
    importItem: (importItemId) => {
      return `/settings/community-hub/import-item${importItemId ? `?id=${importItemId}` : ""}`;
    },
    profile: function (username) {
      if (username) return `${this.website()}/u/${username}`;
      return `${this.website()}/me`;
    },
    noPrivateItems: () => {
      return ALATA_REPO_URL;
    },
  },

  // TODO: Point these to dedicated Octopus Studio docs when they are published.
  documentation: {
    mobileIntroduction: () => {
      return ALATA_REPO_URL;
    },
    contextWindows: () => {
      return ALATA_REPO_URL;
    },
  },

  // 内置文档路由
  internalDocs: {
    customSkills: () => {
      return "/docs/custom-skills";
    },
    agentFlows: () => {
      return "/docs/agent-flows";
    },
    mcpServers: () => {
      return "/docs/mcp-servers";
    },
  },

  openClaw: {
    index: () => "/openclaw",
  },

  experimental: {
    liveDocumentSync: {
      manage: () => `/settings/beta-features/live-document-sync/manage`,
    },
  },
};
