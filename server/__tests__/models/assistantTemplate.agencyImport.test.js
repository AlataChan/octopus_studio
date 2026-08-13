const { AssistantTemplate } = require("../../models/assistantTemplate");

jest.mock("../../utils/prisma", () => ({
  assistant_templates: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");

describe("AssistantTemplate agency import support", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("upsertByOriginPath creates new template when originPath does not exist", async () => {
    prisma.assistant_templates.findFirst.mockResolvedValue(null);
    prisma.assistant_templates.create.mockResolvedValue({
      id: "template_1",
      name: "后端架构师",
      description: "Backend architect",
      category: "engineering",
      originPath: "engineering/backend-architect.md",
      contentHash: "hash_1",
      sourceType: "markdown",
      sourceUrl: "https://example.com/backend-architect.md",
      sourceLicense: "MIT",
      sourceCommit: "abc1234",
      vibe: "Builds systems that do not fall over.",
      color: "#22C55E",
      tags: "[]",
      skills: "[]",
      internalRoles: null,
      defaultTools: "[]",
      defaultMCPServers: null,
      defaultAllowedTools: "[]",
      defaultAutoApprovedTools: "[]",
      resourceScopes: null,
      platformConfig: null,
      workExperience: "[]",
      certifications: "[]",
    });

    const result = await AssistantTemplate.upsertByOriginPath({
      name: "后端架构师",
      description: "Backend architect",
      category: "engineering",
      originPath: "engineering/backend-architect.md",
      contentHash: "hash_1",
      sourceType: "markdown",
      sourceUrl: "https://example.com/backend-architect.md",
      sourceLicense: "MIT",
      sourceCommit: "abc1234",
      vibe: "Builds systems that do not fall over.",
      color: "#22C55E",
    });

    expect(result.action).toBe("create");
    expect(result.template).toMatchObject({
      name: "后端架构师",
      originPath: "engineering/backend-architect.md",
    });
    expect(prisma.assistant_templates.create).toHaveBeenCalledTimes(1);
  });

  test("upsertByOriginPath skips when contentHash is unchanged", async () => {
    prisma.assistant_templates.findFirst.mockResolvedValue({
      id: "template_1",
      name: "后端架构师",
      description: "Backend architect",
      category: "engineering",
      originPath: "engineering/backend-architect.md",
      contentHash: "hash_1",
      tags: "[]",
      skills: "[]",
      internalRoles: null,
      defaultTools: "[]",
      defaultMCPServers: null,
      defaultAllowedTools: "[]",
      defaultAutoApprovedTools: "[]",
      resourceScopes: null,
      platformConfig: null,
      workExperience: "[]",
      certifications: "[]",
    });

    const result = await AssistantTemplate.upsertByOriginPath({
      name: "后端架构师",
      description: "Backend architect",
      category: "engineering",
      originPath: "engineering/backend-architect.md",
      contentHash: "hash_1",
    });

    expect(result.action).toBe("skip");
    expect(prisma.assistant_templates.create).not.toHaveBeenCalled();
    expect(prisma.assistant_templates.update).not.toHaveBeenCalled();
  });

  test("upsertByOriginPath updates when contentHash differs", async () => {
    prisma.assistant_templates.findFirst.mockResolvedValue({
      id: "template_1",
      name: "后端架构师",
      description: "Backend architect",
      category: "engineering",
      originPath: "engineering/backend-architect.md",
      contentHash: "old_hash",
      tags: "[]",
      skills: "[]",
      internalRoles: null,
      defaultTools: "[]",
      defaultMCPServers: null,
      defaultAllowedTools: "[]",
      defaultAutoApprovedTools: "[]",
      resourceScopes: null,
      platformConfig: null,
      workExperience: "[]",
      certifications: "[]",
    });
    prisma.assistant_templates.update.mockResolvedValue({
      id: "template_1",
      name: "资深后端架构师",
      description: "Updated backend architect",
      category: "engineering",
      originPath: "engineering/backend-architect.md",
      contentHash: "new_hash",
      sourceType: "markdown",
      sourceUrl: "https://example.com/backend-architect.md",
      sourceLicense: "MIT",
      sourceCommit: "def5678",
      vibe: "Keeps backend systems calm under load.",
      color: "#2563EB",
      tags: "[]",
      skills: '["APIs","Scalability","Architecture"]',
      internalRoles: null,
      defaultTools: '["web-search"]',
      defaultMCPServers: null,
      defaultAllowedTools: '["web-search"]',
      defaultAutoApprovedTools: '["web-search"]',
      resourceScopes: null,
      platformConfig: null,
      workExperience: "[]",
      certifications: "[]",
    });

    const result = await AssistantTemplate.upsertByOriginPath({
      name: "资深后端架构师",
      description: "Updated backend architect",
      category: "engineering",
      originPath: "engineering/backend-architect.md",
      contentHash: "new_hash",
      sourceType: "markdown",
      sourceUrl: "https://example.com/backend-architect.md",
      sourceLicense: "MIT",
      sourceCommit: "def5678",
      vibe: "Keeps backend systems calm under load.",
      color: "#2563EB",
      skills: ["APIs", "Scalability", "Architecture"],
      defaultTools: ["web-search"],
      defaultAllowedTools: ["web-search"],
      defaultAutoApprovedTools: ["web-search"],
    });

    expect(result.action).toBe("update");
    expect(prisma.assistant_templates.update).toHaveBeenCalledWith({
      where: { id: "template_1" },
      data: expect.objectContaining({
        name: "资深后端架构师",
        contentHash: "new_hash",
        sourceCommit: "def5678",
      }),
    });
    expect(result.template.skills).toEqual([
      "APIs",
      "Scalability",
      "Architecture",
    ]);
  });

  test("_formatTemplate exposes new fields vibe/color and source object", () => {
    const rawTemplate = {
      id: "template_1",
      name: "增长黑客",
      description: "Growth hacker",
      category: "marketing",
      vibe: "Turns channels into engines.",
      color: "#F97316",
      sourceType: "markdown",
      sourceUrl: "https://example.com/growth-hacker.md",
      sourceLicense: "MIT",
      sourceCommit: "abc1234",
      originPath: "marketing/growth-hacker.md",
      contentHash: "hash_growth",
      tags: '["growth"]',
      skills: '["SEO", "Funnels", "Analytics"]',
      internalRoles: null,
      defaultTools: '["web-search"]',
      defaultMCPServers: null,
      defaultAllowedTools: '["web-search"]',
      defaultAutoApprovedTools: '["web-search"]',
      resourceScopes: null,
      platformConfig: null,
      workExperience: "[]",
      certifications: "[]",
    };

    const formatted = AssistantTemplate._formatTemplate(rawTemplate);

    expect(formatted.vibe).toBe("Turns channels into engines.");
    expect(formatted.color).toBe("#F97316");
    expect(formatted.source).toEqual({
      type: "markdown",
      url: "https://example.com/growth-hacker.md",
      license: "MIT",
      commit: "abc1234",
      originPath: "marketing/growth-hacker.md",
      contentHash: "hash_growth",
    });
  });

  test("_formatTemplate keeps flat fields for backward compat", () => {
    const rawTemplate = {
      id: "template_1",
      name: "增长黑客",
      description: "Growth hacker",
      category: "marketing",
      sourceType: "markdown",
      sourceUrl: "https://example.com/growth-hacker.md",
      sourceLicense: "MIT",
      sourceCommit: "abc1234",
      originPath: "marketing/growth-hacker.md",
      contentHash: "hash_growth",
      vibe: "Turns channels into engines.",
      color: "#F97316",
      tags: "[]",
      skills: "[]",
      internalRoles: null,
      defaultTools: "[]",
      defaultMCPServers: null,
      defaultAllowedTools: "[]",
      defaultAutoApprovedTools: "[]",
      resourceScopes: null,
      platformConfig: null,
      workExperience: "[]",
      certifications: "[]",
    };

    const formatted = AssistantTemplate._formatTemplate(rawTemplate);

    expect(formatted.sourceType).toBe("markdown");
    expect(formatted.sourceUrl).toBe("https://example.com/growth-hacker.md");
    expect(formatted.sourceLicense).toBe("MIT");
    expect(formatted.sourceCommit).toBe("abc1234");
    expect(formatted.originPath).toBe("marketing/growth-hacker.md");
    expect(formatted.contentHash).toBe("hash_growth");
  });
});
