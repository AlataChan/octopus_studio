const { unifiedSearch } = require("../registry");
const { installer } = require("../lifecycle");

function pickRecommendation(searchResult) {
  const local = Array.isArray(searchResult?.local) ? searchResult.local : [];
  const external = Array.isArray(searchResult?.external)
    ? searchResult.external
    : [];
  if (local.length > 0) return { skill: local[0], source: "local" };
  if (external.length > 0) return { skill: external[0], source: "external" };
  return { skill: null, source: null };
}

class SkillAutobotAgent {
  constructor(options = {}) {
    this.unifiedSearch = options.unifiedSearch || unifiedSearch;
    this.installer = options.installer || installer;
  }

  async handle({ message, context = {} } = {}) {
    const text = String(message || "").trim();
    if (!text) throw new Error("message is required");

    const topN = Number.isFinite(context.topN) ? Number(context.topN) : 5;
    const searchResult = await this.unifiedSearch.search(text, { topN });
    const { skill: recommended, source } = pickRecommendation(searchResult);

    const workspaceId =
      context.workspaceId === undefined ? null : Number(context.workspaceId);
    const assistantId =
      context.assistantId === undefined ? null : context.assistantId;
    const autoInstall =
      context.autoInstall === undefined
        ? workspaceId !== null
        : context.autoInstall === true;

    let installResult = null;
    if (
      autoInstall &&
      recommended?.skillId &&
      workspaceId !== null &&
      Number.isFinite(workspaceId)
    ) {
      try {
        installResult = await this.installer.install(recommended.skillId, {
          workspaceId,
          assistantId,
        });
      } catch (error) {
        installResult = { success: false, error: error.message };
      }
    }

    return {
      success: true,
      query: text,
      recommended: recommended
        ? { ...recommended, _recommendedSource: source }
        : null,
      search: searchResult,
      installResult,
    };
  }
}

module.exports = { SkillAutobotAgent };
