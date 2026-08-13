process.env.NODE_ENV = "test";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { mockRequest, mockResponse } = require("../utils/testHelpers");
const { parseFrontmatter } = require("../../utils/plugins/MarkdownParser");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-endpoint-"));
}

function writeSkillMd(filePath, frontmatter, body = "Body") {
  const yaml = require("js-yaml");
  const content = `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${String(body).trim()}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_req, _res, next) => next?.(),
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  flexUserRoleValid: () => (_req, _res, next) => next?.(),
  ROLES: { admin: "admin", manager: "manager" },
}));

jest.mock("../../utils/middleware/skillHubExternalDownloadsEnabled", () => ({
  skillHubExternalDownloadsEnabled: (_req, _res, next) => next?.(),
}));

jest.mock("../../utils/http", () => ({
  reqBody: (req) => req.body,
  safeJsonParse: (input, fallback) => {
    try {
      return JSON.parse(input);
    } catch {
      return fallback;
    }
  },
}));

const mockLocalRegistry = {
  builtinBaseRoot: "/dev/null",
  customBaseRoot: "/dev/null",
  scan: jest.fn(async () => []),
  get: jest.fn(() => null),
  _skills: [],
};

jest.mock("../../utils/plugins/skillHub/registry", () => ({
  unifiedSearch: {},
  localRegistry: mockLocalRegistry,
  externalRegistry: {},
  communityRegistry: {},
}));

jest.mock("../../utils/plugins/skillHub/lifecycle", () => ({
  creator: {},
  checker: {},
  upgrader: {},
  evolver: {},
  validator: {},
  installer: {},
  runCycle: jest.fn(),
}));

jest.mock("../../models/skillCatalog", () => ({ SkillCatalog: {} }));
jest.mock("../../models/skillInstallations", () => ({ SkillInstallations: {} }));
jest.mock("../../models/skillHubJobs", () => ({
  SkillHubJobs: {
    Status: { RUNNING: "running", DONE: "done", FAILED: "failed" },
    start: jest.fn(async () => ({ id: 1 })),
    update: jest.fn(async () => true),
    finish: jest.fn(async () => true),
  },
}));
jest.mock("../../models/eventLogs", () => ({
  EventLogs: { logEvent: jest.fn(async () => true) },
}));
jest.mock("../../models/systemSettings", () => ({
  SystemSettings: { getValueOrFallback: jest.fn(async () => "[]") },
}));
jest.mock("../../utils/permissions/toolAliases", () => ({
  getRuntimeToolNamesForAbstract: jest.fn(() => []),
}));
jest.mock("../../utils/scheduler", () => ({
  getSchedulerStatus: jest.fn(async () => ({})),
  triggerKnowledgeSync: jest.fn(async () => ({ ok: true })),
  triggerSkillHubDiscovery: jest.fn(async () => ({ ok: true })),
}));

const mockAgentFlowsLoadFlow = jest.fn(() => null);
jest.mock("../../utils/agentFlows", () => ({
  AgentFlows: {
    loadFlow: (...args) => mockAgentFlowsLoadFlow(...args),
  },
}));

describe("Skill Hub flowTemplates import endpoint", () => {
  beforeEach(() => {
    mockLocalRegistry.scan.mockImplementation(async () => []);
    mockLocalRegistry.get.mockImplementation(() => null);
    mockAgentFlowsLoadFlow.mockImplementation(() => null);
  });

  test("POST /skill-hub/skill/:skillId/flow-templates/import upserts into skill.md frontmatter", async () => {
    const tmpRoot = mkTmpDir();
    const skillMdPath = path.join(tmpRoot, "skills", "my-skill", "skill.md");
    writeSkillMd(skillMdPath, {
      name: "My Skill",
      description: "Demo",
      tools: ["http-request"],
      sourceType: "local",
    });

    mockLocalRegistry.customBaseRoot = tmpRoot;
    mockLocalRegistry.get.mockImplementation((skillId) => {
      if (skillId !== "custom:my-skill") return null;
      return {
        skillId: "custom:my-skill",
        sourceType: "local",
        originPath: "skills/my-skill/skill.md",
      };
    });

    mockAgentFlowsLoadFlow.mockImplementation((uuid) => {
      if (uuid !== "11111111-1111-4111-8111-111111111111") return null;
      return {
        name: "Demo Flow",
        uuid,
        config: {
          name: "Demo Flow",
          description: "demo",
          active: true,
          steps: [{ type: "start", config: { variables: [] } }],
        },
      };
    });

    const routes = {};
    const app = {
      get: jest.fn((p, ...rest) => {
        routes[`GET ${p}`] = { handler: rest[rest.length - 1] };
      }),
      post: jest.fn((p, ...rest) => {
        routes[`POST ${p}`] = { handler: rest[rest.length - 1] };
      }),
      patch: jest.fn((p, ...rest) => {
        routes[`PATCH ${p}`] = { handler: rest[rest.length - 1] };
      }),
      put: jest.fn((p, ...rest) => {
        routes[`PUT ${p}`] = { handler: rest[rest.length - 1] };
      }),
      delete: jest.fn((p, ...rest) => {
        routes[`DELETE ${p}`] = { handler: rest[rest.length - 1] };
      }),
    };

    const { skillHubEndpoints } = require("../../endpoints/skillHub");
    skillHubEndpoints(app);

    const route = routes["POST /skill-hub/skill/:skillId/flow-templates/import"];
    expect(route).toBeDefined();

    const req = mockRequest({
      params: { skillId: "custom:my-skill" },
      body: {
        flowUuid: "11111111-1111-4111-8111-111111111111",
        templateId: "my-flow",
        slashCommand: "/my-flow",
      },
    });
    const res = mockResponse();
    res.locals = { user: { id: 123, role: "admin" } };

    await route.handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );

    const updated = fs.readFileSync(skillMdPath, "utf8");
    const { data } = parseFrontmatter(updated);
    expect(Array.isArray(data.flowTemplates)).toBe(true);
    expect(data.flowTemplates[0]).toEqual(
      expect.objectContaining({
        id: "my-flow",
        slashCommand: "/my-flow",
      })
    );

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});

