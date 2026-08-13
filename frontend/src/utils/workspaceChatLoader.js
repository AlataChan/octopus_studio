import Workspace from "@/models/workspace";

export function withWorkspaceChatDefaults(workspace) {
  if (!workspace) return null;

  return {
    ...workspace,
    suggestedMessages: Array.isArray(workspace.suggestedMessages)
      ? workspace.suggestedMessages
      : [],
    pfpUrl: workspace.pfpUrl ?? null,
  };
}

export function mergeWorkspaceChatExtras(
  currentWorkspace,
  expectedSlug,
  extras
) {
  if (!currentWorkspace || currentWorkspace.slug !== expectedSlug) {
    return currentWorkspace;
  }

  return withWorkspaceChatDefaults({
    ...currentWorkspace,
    suggestedMessages: extras?.suggestedMessages,
    pfpUrl: extras?.pfpUrl,
  });
}

export async function loadWorkspaceChatData({ slug, threadSlug = null, assistantId = undefined }) {
  if (!slug) {
    return {
      workspace: null,
      history: [],
    };
  }

  const historyPromise = threadSlug
    ? Workspace.threads.chatHistory(slug, threadSlug, assistantId)
    : Workspace.chatHistory(slug, assistantId);

  const [workspace, history] = await Promise.all([
    Workspace.bySlug(slug),
    historyPromise,
  ]);

  return {
    workspace: withWorkspaceChatDefaults(workspace),
    history: Array.isArray(history) ? history : [],
  };
}

export async function loadWorkspaceChatExtras({ slug }) {
  if (!slug) {
    return {
      suggestedMessages: [],
      pfpUrl: null,
    };
  }

  const [suggestedMessages, pfpUrl] = await Promise.all([
    Workspace.getSuggestedMessages(slug),
    Workspace.fetchPfp(slug),
  ]);

  return {
    suggestedMessages: Array.isArray(suggestedMessages)
      ? suggestedMessages
      : [],
    pfpUrl: pfpUrl ?? null,
  };
}
