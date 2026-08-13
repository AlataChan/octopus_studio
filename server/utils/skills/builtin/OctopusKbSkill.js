const { BaseSkill } = require("../BaseSkill");
const { ConfigFieldType, SkillCategory } = require("../constants");

class OctopusKbSkill extends BaseSkill {
  constructor() {
    super({
      id: "builtin:octopus-kb",
      name: "知识库 (octopus-kb)",
      description:
        "Use octopus-kb for structured knowledge graph retrieval, evidence bundles, and curated vault lookups.",
      version: "1.0.0",
      category: SkillCategory.SEARCH,
      tags: ["knowledge", "graphrag", "mcp", "octopus-kb"],
      icon: "🧠",
    });
  }

  getToolBindings() {
    return [];
  }

  getMCPBindings() {
    return [{ serverName: "octopus-kb" }];
  }

  getSystemPrompt() {
    return [
      "Use octopus-kb MCP tools when the task benefits from structured knowledge retrieval, graph lookup, or curated evidence bundles.",
      "Prefer kb_retrieve_bundle for grounded answers and kb_lookup/kb_neighbors for entity and concept exploration.",
      "Treat kb_ingest, kb_propose, and kb_validate as knowledge curation actions and explain changes before applying them.",
    ].join("\n");
  }

  getConfigSchema() {
    return {
      version: "1.0",
      fields: [
        {
          key: "enabled",
          label: "启用 octopus-kb",
          type: ConfigFieldType.BOOLEAN,
          description: "是否启用本地 octopus-kb MCP 知识库工具。",
          defaultValue: false,
        },
        {
          key: "vaultRoot",
          label: "Vault 根目录",
          type: ConfigFieldType.STRING,
          description: "octopus-kb 工作区 vault 的本地根目录。",
          defaultValue: "",
        },
      ],
    };
  }
}

module.exports = { OctopusKbSkill };
