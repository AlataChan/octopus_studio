const fs = require("fs");
const path = require("path");

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockLogEvent = jest.fn();
const mockSystemUpsert = jest.fn();

jest.mock("../../utils/prisma", () => ({
  workspaces: {
    findFirst: (...args) => mockFindFirst(...args),
    update: (...args) => mockUpdate(...args),
  },
  system_settings: {
    upsert: (...args) => mockSystemUpsert(...args),
    findFirst: jest.fn(),
  },
}));

jest.mock("../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: (...args) => mockLogEvent(...args),
  },
}));

jest.mock("../../models/documents", () => ({
  Document: { forWorkspace: jest.fn() },
}));
jest.mock("../../models/workspaceUsers", () => ({
  WorkspaceUser: { create: jest.fn() },
}));
jest.mock("../../models/user", () => ({
  User: { where: jest.fn() },
}));
jest.mock("../../models/promptHistory", () => ({
  PromptHistory: { handlePromptChange: jest.fn() },
}));
jest.mock("../../models/assistantTemplate", () => ({
  AssistantTemplate: { getDefaultTemplates: jest.fn(async () => []) },
}));
jest.mock("../../models/workspaceAssistant", () => ({
  WorkspaceAssistant: { install: jest.fn() },
}));

describe("workspace tier routing opt-out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("is writable and normalizes booleans", () => {
    const { Workspace } = require("../../models/workspace");

    expect(Workspace.writable).toContain("disableTierRouting");
    expect(Workspace.validations.disableTierRouting(true)).toBe(true);
    expect(Workspace.validations.disableTierRouting(false)).toBe(false);
    expect(Workspace.validations.disableTierRouting("true")).toBe(true);
    expect(Workspace.validations.disableTierRouting("1")).toBe(true);
    expect(Workspace.validations.disableTierRouting("false")).toBe(false);
    expect(Workspace.validations.disableTierRouting(null)).toBe(false);
  });

  test("logs audit only when disableTierRouting changes", async () => {
    const { Workspace } = require("../../models/workspace");
    mockFindFirst.mockResolvedValueOnce({ id: 10, disableTierRouting: false });
    mockUpdate.mockResolvedValueOnce({ id: 10, disableTierRouting: true });

    await Workspace.update(10, { disableTierRouting: true });

    expect(mockLogEvent).toHaveBeenCalledWith(
      "workspace_tier_routing_optout_changed",
      { workspaceId: 10, old: false, new: true },
      null
    );

    jest.clearAllMocks();
    mockFindFirst.mockResolvedValueOnce({ id: 10, disableTierRouting: true });
    mockUpdate.mockResolvedValueOnce({ id: 10, disableTierRouting: true });

    await Workspace.update(10, { disableTierRouting: true });

    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  test("system-preferences filters tier routing labels out of supportedFields", async () => {
    const { SystemSettings } = require("../../models/systemSettings");

    expect(SystemSettings.supportedFields).not.toContain(
      "model_tier_routing_enabled"
    );
    expect(SystemSettings.supportedFields).not.toContain("model_tier_map");

    const result = await SystemSettings.updateSettings({
      model_tier_routing_enabled: "true",
      model_tier_map: JSON.stringify({
        C0: { provider: "openai", model: "gpt-4o-mini" },
      }),
    });

    expect(result).toEqual({ success: true, error: null });
    expect(mockSystemUpsert).not.toHaveBeenCalled();
  });

  test("SQLite and Postgres schemas and migrations contain tier routing storage", () => {
    const root = path.resolve(__dirname, "../..");
    const sqliteSchema = fs.readFileSync(
      path.join(root, "prisma/schema.prisma"),
      "utf8"
    );
    const postgresSchema = fs.readFileSync(
      path.join(root, "prisma/postgres/schema.prisma"),
      "utf8"
    );

    for (const schema of [sqliteSchema, postgresSchema]) {
      expect(schema).toContain("disableTierRouting");
      expect(schema).toContain("model tier_routing_preview_tokens");
      expect(schema).toContain("token");
      expect(schema).toContain("adminUserId");
      expect(schema).toContain("tierMapHash");
      expect(schema).toContain("snapshotHash");
      expect(schema).toContain("consumedAt");
    }

    const sqliteMigrations = fs
      .readdirSync(path.join(root, "prisma/migrations"), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .join("\n");
    const postgresMigrations = fs
      .readdirSync(path.join(root, "prisma/postgres/migrations"), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .join("\n");

    expect(sqliteMigrations).toMatch(/tier_routing/);
    expect(postgresMigrations).toMatch(/tier_routing/);
  });
});
