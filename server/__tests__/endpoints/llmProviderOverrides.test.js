/* eslint-env jest, node */

const express = require("express");
const request = require("supertest");

const mockWorkspaceWhere = jest.fn();
let mockRole = "admin";

jest.mock("../../models/workspace", () => ({
  Workspace: {
    where: (...args) => mockWorkspaceWhere(...args),
  },
}));

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    currentSettings: jest.fn(),
    isMultiUserMode: jest.fn(async () => true),
  },
}));

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, response, next) => {
    response.locals.multiUserMode = true;
    response.locals.user = mockRole ? { id: 1, role: mockRole } : null;
    next();
  },
}));

jest.mock("../../utils/http", () => ({
  reqBody: (request) => request.body,
  queryParams: (request) => request.query,
  makeJWT: jest.fn(),
  userFromSession: jest.fn(async () => null),
  multiUserMode: (response) => response.locals.multiUserMode,
}));

jest.mock("../../utils/helpers/updateENV", () => ({
  updateENV: jest.fn(),
  dumpENV: jest.fn(),
}));

jest.mock("../../utils/helpers", () => ({
  getVectorDbClass: jest.fn(),
}));

jest.mock("../../utils/files", () => ({
  viewLocalFiles: jest.fn(),
  normalizePath: jest.fn((value) => value),
  isWithin: jest.fn(() => true),
}));

jest.mock("../../utils/files/purgeDocument", () => ({
  purgeDocument: jest.fn(),
  purgeFolder: jest.fn(),
}));

jest.mock("../../utils/files/multer", () => ({
  handleAssetUpload: jest.fn(),
  handleIconUpload: jest.fn(),
  handlePfpUpload: jest.fn(),
}));

jest.mock("../../utils/files/appIcon", () => ({
  generateAppIconSet: jest.fn(),
  fetchAppIcon: jest.fn(),
  removeAppIconSet: jest.fn(),
  currentAppIcon: jest.fn(),
  isValidSizeKey: jest.fn(),
}));

jest.mock("../../utils/files/logo", () => ({
  getDefaultFilename: jest.fn(),
  determineLogoFilepath: jest.fn(),
  fetchLogo: jest.fn(),
  validFilename: jest.fn(),
  renameLogoFile: jest.fn(),
  removeCustomLogo: jest.fn(),
  LOGO_FILENAME: "logo.png",
  isDefaultFilename: jest.fn(),
}));

jest.mock("../../models/user", () => ({ User: {} }));
jest.mock("../../models/telemetry", () => ({ Telemetry: {} }));
jest.mock("../../models/welcomeMessages", () => ({ WelcomeMessages: {} }));
jest.mock("../../models/apiKeys", () => ({ ApiKey: {} }));
jest.mock("../../utils/helpers/customModels", () => ({
  getCustomModels: jest.fn(),
}));
jest.mock("../../models/workspaceChats", () => ({ WorkspaceChats: {} }));
jest.mock("../../models/eventLogs", () => ({ EventLogs: {} }));
jest.mock("../../utils/collectorApi", () => ({ CollectorApi: jest.fn() }));
jest.mock("../../utils/PasswordRecovery", () => ({
  recoverAccount: jest.fn(),
  resetPassword: jest.fn(),
  generateRecoveryCodes: jest.fn(),
}));
jest.mock("../../models/slashCommandsPresets", () => ({
  SlashCommandPresets: {},
}));
jest.mock("../../utils/EncryptionManager", () => ({
  EncryptionManager: jest.fn(),
}));
jest.mock("../../utils/authRuntime", () => ({
  isDesktopSingleUserNoAuthRuntime: jest.fn(() => false),
}));
jest.mock("../../models/browserExtensionApiKey", () => ({
  BrowserExtensionApiKey: {},
}));
jest.mock("../../utils/middleware/chatHistoryViewable", () => ({
  chatHistoryViewable: jest.fn((_request, _response, next) => next()),
}));
jest.mock("../../utils/middleware/simpleSSOEnabled", () => ({
  simpleSSOEnabled: jest.fn(() => false),
  simpleSSOLoginDisabled: jest.fn(() => false),
}));
jest.mock("../../models/temporaryAuthToken", () => ({
  TemporaryAuthToken: {},
}));
jest.mock("../../models/systemPromptVariables", () => ({
  SystemPromptVariables: {},
}));
jest.mock("../../utils/chats", () => ({ VALID_COMMANDS: [] }));
jest.mock("../../middleware/rateLimiter", () => ({
  authLimiter: (_request, _response, next) => next(),
  strictLimiter: (_request, _response, next) => next(),
}));

function buildApp() {
  jest.resetModules();
  const app = express();
  app.use(express.json());
  const { systemEndpoints } = require("../../endpoints/system");
  systemEndpoints(app);
  return app;
}

describe("GET /system/llm-provider-overrides", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = "admin";
  });

  test("returns only minimal override fields for admins", async () => {
    mockWorkspaceWhere.mockResolvedValue([
      {
        id: 1,
        name: "Alata",
        slug: "alata",
        chatProvider: "deepseek",
        chatModel: "deepseek-v4-pro",
        agentProvider: null,
        openAiPrompt: "secret prompt",
      },
      {
        id: 2,
        name: "Agent Workspace",
        chatProvider: null,
        agentProvider: "openai",
        agentModel: "gpt-4o",
      },
      {
        id: 3,
        name: "Default Workspace",
        chatProvider: null,
        agentProvider: null,
      },
    ]);

    const response = await request(buildApp())
      .get("/system/llm-provider-overrides")
      .expect(200);

    expect(mockWorkspaceWhere).toHaveBeenCalledWith({
      OR: [{ chatProvider: { not: null } }, { agentProvider: { not: null } }],
    });
    expect(response.body).toEqual({
      overrides: [
        {
          id: 1,
          name: "Alata",
          chatProvider: "deepseek",
          agentProvider: null,
        },
        {
          id: 2,
          name: "Agent Workspace",
          chatProvider: null,
          agentProvider: "openai",
        },
      ],
    });
  });

  test("returns an empty override list when no workspace overrides exist", async () => {
    mockWorkspaceWhere.mockResolvedValue([]);

    const response = await request(buildApp())
      .get("/system/llm-provider-overrides")
      .expect(200);

    expect(response.body).toEqual({ overrides: [] });
  });

  test("denies non-admin users", async () => {
    mockRole = "default";

    await request(buildApp()).get("/system/llm-provider-overrides").expect(401);
    expect(mockWorkspaceWhere).not.toHaveBeenCalled();
  });
});
