/**
 * @fileoverview MCP Templates 单元测试
 */

const {
  MCP_TEMPLATES,
  MCP_CATEGORIES,
  MCP_DIFFICULTY,
  getAllTemplates,
  getTemplate,
  getTemplatesByCategory,
  getEasyTemplates,
  generateMCPConfig,
} = require("../../../utils/MCP/templates");

describe("MCP Templates", () => {
  describe("MCP_CATEGORIES", () => {
    it("should have all expected categories", () => {
      expect(MCP_CATEGORIES.SYSTEM).toBe("system");
      expect(MCP_CATEGORIES.WEB).toBe("web");
      expect(MCP_CATEGORIES.CORE).toBe("core");
      expect(MCP_CATEGORIES.DATA).toBe("data");
      expect(MCP_CATEGORIES.INTEGRATION).toBe("integration");
    });
  });

  describe("MCP_DIFFICULTY", () => {
    it("should have all expected difficulty levels", () => {
      expect(MCP_DIFFICULTY.EASY).toBe("easy");
      expect(MCP_DIFFICULTY.MEDIUM).toBe("medium");
      expect(MCP_DIFFICULTY.HARD).toBe("hard");
    });
  });

  describe("MCP_TEMPLATES", () => {
    it("should have filesystem template", () => {
      expect(MCP_TEMPLATES.filesystem).toBeDefined();
      expect(MCP_TEMPLATES.filesystem.name).toBe("filesystem");
      expect(MCP_TEMPLATES.filesystem.category).toBe(MCP_CATEGORIES.SYSTEM);
    });

    it("should have fetch template", () => {
      expect(MCP_TEMPLATES.fetch).toBeDefined();
      expect(MCP_TEMPLATES.fetch.name).toBe("fetch");
      expect(MCP_TEMPLATES.fetch.category).toBe(MCP_CATEGORIES.WEB);
    });

    it("should have memory template", () => {
      expect(MCP_TEMPLATES.memory).toBeDefined();
      expect(MCP_TEMPLATES.memory.name).toBe("memory");
      expect(MCP_TEMPLATES.memory.category).toBe(MCP_CATEGORIES.CORE);
    });

    it("should have valid config structure for all templates", () => {
      Object.values(MCP_TEMPLATES).forEach((template) => {
        expect(template.name).toBeDefined();
        expect(template.displayName).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.config).toBeDefined();
        expect(template.config.command).toBeDefined();
        expect(template.config.args).toBeDefined();
      });
    });
  });

  describe("getAllTemplates()", () => {
    it("should return all templates", () => {
      const templates = getAllTemplates();

      expect(templates.filesystem).toBeDefined();
      expect(templates.fetch).toBeDefined();
      expect(templates.memory).toBeDefined();
    });

    it("should return a copy, not the original", () => {
      const templates = getAllTemplates();

      expect(templates).not.toBe(MCP_TEMPLATES);
    });
  });

  describe("getTemplate()", () => {
    it("should return template by name", () => {
      const template = getTemplate("filesystem");

      expect(template).toBeDefined();
      expect(template.name).toBe("filesystem");
    });

    it("should return null for unknown template", () => {
      const template = getTemplate("unknown-template");

      expect(template).toBeNull();
    });
  });

  describe("getTemplatesByCategory()", () => {
    it("should return templates by category", () => {
      const systemTemplates = getTemplatesByCategory(MCP_CATEGORIES.SYSTEM);

      expect(Array.isArray(systemTemplates)).toBe(true);
      expect(systemTemplates.some((t) => t.name === "filesystem")).toBe(true);
    });

    it("should return empty array for unknown category", () => {
      const templates = getTemplatesByCategory("unknown-category");

      expect(templates).toEqual([]);
    });
  });

  describe("getEasyTemplates()", () => {
    it("should return only easy templates that need no config", () => {
      const easyTemplates = getEasyTemplates();

      expect(Array.isArray(easyTemplates)).toBe(true);
      easyTemplates.forEach((template) => {
        expect(template.difficulty).toBe(MCP_DIFFICULTY.EASY);
        expect(template.setup.needsConfig).toBe(false);
      });
    });
  });

  describe("generateMCPConfig()", () => {
    it("should generate config for specified templates", () => {
      const config = generateMCPConfig(["filesystem", "fetch"]);

      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers.filesystem).toBeDefined();
      expect(config.mcpServers.fetch).toBeDefined();
    });

    it("should skip unknown templates", () => {
      const config = generateMCPConfig(["filesystem", "unknown"]);

      expect(config.mcpServers.filesystem).toBeDefined();
      expect(config.mcpServers.unknown).toBeUndefined();
    });

    it("should return empty mcpServers for empty input", () => {
      const config = generateMCPConfig([]);

      expect(config.mcpServers).toEqual({});
    });

    it("should include anythingllm config", () => {
      const config = generateMCPConfig(["filesystem"]);

      expect(config.mcpServers.filesystem.anythingllm).toBeDefined();
      expect(config.mcpServers.filesystem.anythingllm.autoStart).toBe(false);
    });
  });
});

