const { unifiedSearch } = require("../registry");
const { creator, installer, validator } = require("../lifecycle");

/**
 * Minimal tool wrappers for Skill Hub Autobot (Phase 5 MVP).
 * These are plain JS tool definitions (not MCP) for future agent wiring.
 */
const autobotTools = [
  {
    name: "search_skills",
    description: "Search local + external Skill registries",
    parameters: {
      query: { type: "string", required: true },
      source: { type: "string", enum: ["all", "local", "external"] },
      topN: { type: "number" },
    },
    handler: async ({ query, source = "all", topN = 10 }) => {
      const localOnly = source === "local";
      const externalOnly = source === "external";
      return await unifiedSearch.search(String(query || ""), {
        topN,
        localOnly,
        externalOnly,
      });
    },
  },
  {
    name: "create_skill_from_github",
    description: "Create a local Skill from a GitHub repository URL",
    parameters: {
      githubUrl: { type: "string", required: true },
    },
    handler: async ({ githubUrl }) => {
      return await creator.createFromGitHub(String(githubUrl || ""));
    },
  },
  {
    name: "validate_skill",
    description: "Validate a local Skill manifest and tool bindings",
    parameters: {
      skillId: { type: "string", required: true },
    },
    handler: async ({ skillId }) => {
      return await validator.validate(String(skillId || ""));
    },
  },
  {
    name: "install_skill",
    description:
      "Install/bind a Skill to a Workspace (and optionally an assistant scope)",
    parameters: {
      skillId: { type: "string", required: true },
      workspaceId: { type: "number" },
      assistantId: { type: "string" },
    },
    handler: async ({ skillId, workspaceId, assistantId }) => {
      return await installer.install(String(skillId || ""), {
        workspaceId,
        assistantId,
      });
    },
  },
];

module.exports = { autobotTools };
