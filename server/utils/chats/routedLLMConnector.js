const { getLLMProvider } = require("../helpers");
const {
  resolveTieredRoute,
} = require("../AiProviders/providerRouter/tierRouter");
const { EventLogs } = require("../../models/eventLogs");

function originalProviderParams(workspace) {
  return {
    provider: workspace?.chatProvider,
    model: workspace?.chatModel,
  };
}

async function logTierEvent(event, metadata) {
  try {
    await EventLogs.logEvent(event, metadata);
  } catch (_) {
    // Telemetry must never change chat behavior.
  }
}

async function getRoutedLLMConnector({
  workspace,
  message,
  history = [],
  attachments = [],
  exit = null,
} = {}) {
  const originalParams = originalProviderParams(workspace);
  const route = await resolveTieredRoute({
    workspace,
    message,
    history,
    attachments,
  });

  if (!route) return getLLMProvider(originalParams);

  try {
    const connector = getLLMProvider({
      provider: route.provider,
      model: route.model,
    });
    await logTierEvent("tier_routing_decision", {
      tier: route.tier,
      score: route.score,
      features: route.features,
      chosenProvider: route.provider,
      chosenModel: route.model,
      workspaceId: workspace?.id ?? null,
      exit,
    });
    return connector;
  } catch (error) {
    await logTierEvent("tier_routing_fallback", {
      tier: route.tier,
      score: route.score,
      features: route.features,
      chosenProvider: route.provider,
      chosenModel: route.model,
      fallbackProvider: originalParams.provider,
      fallbackModel: originalParams.model,
      workspaceId: workspace?.id ?? null,
      exit,
      error: error.message,
    });
    return getLLMProvider(originalParams);
  }
}

module.exports = {
  getRoutedLLMConnector,
};
