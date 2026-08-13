const express = require("express");
const fs = require("fs/promises");
const jwt = require("jsonwebtoken");
const path = require("path");
const request = require("supertest");
const { isAllowed } = require("./runtimeBrandingAllowlist");

const mockIsMultiUserMode = jest.fn();
const mockCurrentSettings = jest.fn();
const mockUserGet = jest.fn();
const mockUserGetByUsername = jest.fn();
const mockLogEvent = jest.fn();
const mockSendTelemetry = jest.fn();
const mockViewLocalFiles = jest.fn();
const mockPurgeDocument = jest.fn();
const mockWorkspaceGet = jest.fn();
const mockWorkspaceGetWithUser = jest.fn();
const mockWorkspaceWhere = jest.fn();
const mockWorkspaceWhereWithUser = jest.fn();
const mockDocumentAddDocuments = jest.fn();
const mockCollectorOnline = jest.fn();
const mockCollectorProcessDocument = jest.fn();
const mockNotificationGetUnreadCount = jest.fn();
const mockImageAssetGet = jest.fn();
const mockImageAssetGetAccessUrl = jest.fn();
const mockWorkspaceUserFindFirst = jest.fn();

process.env.JWT_SECRET = "production-readiness-smoke-secret";
process.env.AUTH_TOKEN = "smoke-password";
process.env.SIG_KEY = "a".repeat(64);
process.env.SIG_SALT = "b".repeat(64);
process.env.JWT_EXPIRY = "1h";

jest.mock("../../middleware/rateLimiter", () => ({
  authLimiter: (_request, _response, next) => next(),
  strictLimiter: (_request, _response, next) => next(),
  generalLimiter: (_request, _response, next) => next(),
}));

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    isMultiUserMode: (...args) => mockIsMultiUserMode(...args),
    currentSettings: (...args) => mockCurrentSettings(...args),
  },
}));

jest.mock("../../models/user", () => ({
  User: {
    get: (...args) => mockUserGet(...args),
    _get: (...args) => mockUserGetByUsername(...args),
    filterFields: (user) => user,
  },
}));

jest.mock("../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: (...args) => mockLogEvent(...args),
  },
}));

jest.mock("../../models/telemetry", () => ({
  Telemetry: {
    sendTelemetry: (...args) => mockSendTelemetry(...args),
  },
}));

jest.mock("../../utils/files", () => {
  const path = require("path");
  return {
    documentsPath: path.join(__dirname, "..", ".storage", "documents"),
    viewLocalFiles: (...args) => mockViewLocalFiles(...args),
    normalizePath: (value = "") => String(value).replace(/^\/+/, ""),
    isWithin: (root, target) =>
      path.resolve(target).startsWith(path.resolve(root)),
  };
});

jest.mock("../../utils/files/purgeDocument", () => ({
  purgeDocument: (...args) => mockPurgeDocument(...args),
  purgeFolder: jest.fn(),
}));

jest.mock("../../utils/files/multer", () => ({
  handleFileUpload: (request, _response, next) => {
    request.file = { originalname: "smoke-upload.txt" };
    next();
  },
  handlePfpUpload: (_request, _response, next) => next(),
  handleAssetUpload: (_request, _response, next) => next(),
  handleIconUpload: (_request, _response, next) => next(),
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  ROLES: { admin: "admin", manager: "manager", all: "all" },
  flexUserRoleValid: () => (_request, _response, next) => next(),
  isMultiUserSetup: jest.fn(() => false),
}));

jest.mock("../../utils/middleware/validWorkspace", () => ({
  validWorkspaceSlug: (request, response, next) => {
    response.locals.workspace = { id: 1, slug: request.params.slug };
    next();
  },
}));

jest.mock("../../utils/helpers", () => ({
  getVectorDbClass: () => ({
    namespaceCount: jest.fn().mockResolvedValue(0),
    totalVectors: jest.fn().mockResolvedValue(0),
    deleteVectorsInNamespace: jest.fn().mockResolvedValue(true),
  }),
}));

jest.mock("../../utils/helpers/updateENV", () => ({
  updateENV: jest.fn(),
  dumpENV: jest.fn(),
}));

jest.mock("../../utils/collectorApi", () => ({
  CollectorApi: class {
    online(...args) {
      return mockCollectorOnline(...args);
    }

    processDocument(...args) {
      return mockCollectorProcessDocument(...args);
    }

    log() {}
  },
}));

jest.mock("../../models/workspace", () => ({
  Workspace: {
    get: (...args) => mockWorkspaceGet(...args),
    getWithUser: (...args) => mockWorkspaceGetWithUser(...args),
    where: (...args) => mockWorkspaceWhere(...args),
    whereWithUser: (...args) => mockWorkspaceWhereWithUser(...args),
    trackChange: jest.fn(),
    promptHistory: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../../models/documents", () => ({
  Document: {
    addDocuments: (...args) => mockDocumentAddDocuments(...args),
    removeDocuments: jest.fn().mockResolvedValue({}),
    where: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("../../models/notification", () => ({
  Notification: {
    getUnreadCount: (...args) => mockNotificationGetUnreadCount(...args),
  },
}));

jest.mock("../../models/imageAsset", () => ({
  ImageAsset: {
    get: (...args) => mockImageAssetGet(...args),
    getAccessUrl: (...args) => mockImageAssetGetAccessUrl(...args),
  },
}));

jest.mock("../../utils/prisma", () => ({
  workspace_users: {
    findFirst: (...args) => mockWorkspaceUserFindFirst(...args),
  },
  image_assets: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  image_jobs: {
    update: jest.fn().mockResolvedValue({}),
  },
  $disconnect: jest.fn(),
}));

jest.mock("../../models/vectors", () => ({
  DocumentVectors: {},
}));

jest.mock("../../models/workspaceChats", () => ({
  WorkspaceChats: {
    where: jest.fn().mockResolvedValue([]),
    _update: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("../../models/workspacesSuggestedMessages", () => ({
  WorkspaceSuggestedMessages: {
    get: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../../models/workspaceThread", () => ({
  WorkspaceThread: {
    where: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../../models/workspaceAssistant", () => ({
  WorkspaceAssistant: {
    listByWorkspace: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../../utils/office/singleton", () => ({
  getOfficeProjection: () => ({
    getWorkspaceState: jest.fn().mockResolvedValue(null),
  }),
}));

jest.mock("../../models/welcomeMessages", () => ({
  WelcomeMessages: {},
}));

jest.mock("../../models/apiKeys", () => ({
  ApiKey: {},
}));

jest.mock("../../utils/helpers/customModels", () => ({
  getCustomModels: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../models/browserExtensionApiKey", () => ({
  BrowserExtensionApiKey: {},
}));

jest.mock("../../utils/PasswordRecovery", () => ({
  recoverAccount: jest.fn(),
  resetPassword: jest.fn(),
  generateRecoveryCodes: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../models/slashCommandsPresets", () => ({
  SlashCommandPresets: {},
}));

jest.mock("../../models/temporaryAuthToken", () => ({
  TemporaryAuthToken: {},
}));

jest.mock("../../models/systemPromptVariables", () => ({
  SystemPromptVariables: {},
}));

jest.mock("../../utils/chats", () => ({
  VALID_COMMANDS: [],
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

jest.mock("../../utils/files/pfp", () => ({
  fetchPfp: jest.fn(),
  determinePfpFilepath: jest.fn(),
  determineWorkspacePfpFilepath: jest.fn(),
}));

jest.mock("../../utils/helpers/chat/convertTo", () => ({
  exportChatsAsType: jest.fn(),
}));

jest.mock("../../utils/TextToSpeech", () => ({
  getTTSProvider: jest.fn(),
}));

const { systemEndpoints } = require("../../endpoints/system");
const { workspaceEndpoints } = require("../../endpoints/workspaces");
const { notificationEndpoints } = require("../../endpoints/notifications");
const { workspaceImagesEndpoints } = require("../../endpoints/workspaceImages");

function buildApp(...endpointRegistrars) {
  const app = express();
  app.use(express.json());
  endpointRegistrars.forEach((register) => register(app));
  return app;
}

function tokenFor(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET);
}

function expectNoRuntimeBranding(payload, source) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const matches = body.match(/anythingllm/gi) || [];
  const disallowed = matches.filter(
    (match) => !isAllowed(`${source}:${match}`)
  );
  expect(disallowed).toEqual([]);
}

function localAsset(storagePath, overrides = {}) {
  return {
    id: "asset-1",
    workspaceId: 1,
    filename: "asset.png",
    mimeType: "image/png",
    storageBackend: "local",
    storagePath,
    expiresAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("production readiness smoke", () => {
  const storageRoot = path.resolve(__dirname, "..", ".storage", "smoke");
  const assetPath = path.join(
    storageRoot,
    "images",
    "workspace-1",
    "asset.png"
  );
  const originalEnv = {};

  beforeAll(() => {
    for (const key of [
      "NODE_ENV",
      "JWT_SECRET",
      "AUTH_TOKEN",
      "SIG_KEY",
      "SIG_SALT",
      "JWT_EXPIRY",
      "STORAGE_DIR",
      "ANYTHING_LLM_RUNTIME",
    ]) {
      originalEnv[key] = process.env[key];
    }
  });

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "production-readiness-smoke-secret";
    process.env.AUTH_TOKEN = "smoke-password";
    process.env.SIG_KEY = "a".repeat(64);
    process.env.SIG_SALT = "b".repeat(64);
    process.env.JWT_EXPIRY = "1h";
    process.env.STORAGE_DIR = storageRoot;
    delete process.env.ANYTHING_LLM_RUNTIME;

    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    await fs.writeFile(assetPath, "png");

    mockIsMultiUserMode.mockResolvedValue(false);
    mockCurrentSettings.mockResolvedValue({ productName: "Alata Studio" });
    mockUserGet.mockImplementation(({ id }) => {
      if (Number(id) === 1) return { id: 1, username: "member", role: "admin" };
      if (Number(id) === 2)
        return { id: 2, username: "outsider", role: "default" };
      return null;
    });
    mockUserGetByUsername.mockResolvedValue(null);
    mockLogEvent.mockResolvedValue(undefined);
    mockSendTelemetry.mockResolvedValue(undefined);
    mockViewLocalFiles.mockResolvedValue({ items: [] });
    mockPurgeDocument.mockResolvedValue(undefined);
    mockWorkspaceGet.mockResolvedValue({ id: 1, slug: "smoke" });
    mockWorkspaceGetWithUser.mockResolvedValue({ id: 1, slug: "smoke" });
    mockWorkspaceWhere.mockResolvedValue([
      { id: 1, name: "Alata Workspace", slug: "smoke" },
    ]);
    mockWorkspaceWhereWithUser.mockResolvedValue([
      { id: 1, name: "Alata Workspace", slug: "smoke" },
    ]);
    mockDocumentAddDocuments.mockResolvedValue({
      failedToEmbed: [],
      errors: [],
    });
    mockCollectorOnline.mockResolvedValue(true);
    mockCollectorProcessDocument.mockResolvedValue({
      success: true,
      reason: null,
      documents: [
        { id: 10, location: "custom-documents/smoke-upload.txt.json" },
      ],
    });
    mockNotificationGetUnreadCount.mockResolvedValue(2);
    mockImageAssetGet.mockResolvedValue(localAsset(assetPath));
    mockImageAssetGetAccessUrl.mockResolvedValue(
      "https://signed.example/asset"
    );
    mockWorkspaceUserFindFirst.mockResolvedValue({ id: 10 });
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe("auth", () => {
    test("single-user login returns a token that validates", async () => {
      process.env.NODE_ENV = "production";
      mockIsMultiUserMode.mockResolvedValue(false);
      const app = buildApp(systemEndpoints);

      const login = await request(app)
        .post("/request-token")
        .send({ password: "smoke-password" })
        .expect(200);

      expect(login.body.valid).toBe(true);
      expect(login.body.token).toEqual(expect.any(String));

      await request(app)
        .get("/system/check-token")
        .set("Authorization", `Bearer ${login.body.token}`)
        .expect(200);
    });

    test("desktop single-user no-auth request-token succeeds without JWT_SECRET", async () => {
      process.env.NODE_ENV = "production";
      process.env.ANYTHING_LLM_RUNTIME = "desktop";
      delete process.env.AUTH_TOKEN;
      delete process.env.JWT_SECRET;
      mockIsMultiUserMode.mockResolvedValue(false);
      const app = buildApp(systemEndpoints);

      const login = await request(app)
        .post("/request-token")
        .send({ password: "" })
        .expect(200);

      expect(login.body).toEqual({
        valid: true,
        token: null,
        message:
          "Authentication is not required for desktop single-user runtime.",
      });
    });

    test("stale or invalid tokens return 401 without taking down the server", async () => {
      process.env.NODE_ENV = "production";
      mockIsMultiUserMode.mockResolvedValue(false);
      const app = buildApp(systemEndpoints);

      await request(app)
        .get("/system/check-token")
        .set("Authorization", "Bearer stale-token")
        .expect(401);

      await request(app).get("/ping").expect(200);
    });

    test("production entrypoint fail-fast guard covers required secrets", async () => {
      const entrypoint = await fs.readFile(
        path.resolve(__dirname, "../../../docker/docker-entrypoint.sh"),
        "utf8"
      );
      const checkProductionSecrets = await fs.readFile(
        path.resolve(
          __dirname,
          "../../../docker/scripts/check-production-secrets.sh"
        ),
        "utf8"
      );

      expect(entrypoint).toContain(
        "/app/docker/scripts/check-production-secrets.sh"
      );
      expect(entrypoint).toMatch(
        /if ! \/app\/docker\/scripts\/check-production-secrets\.sh; then\s+exit 1\s+fi/
      );
      expect(checkProductionSecrets).toContain('NODE_ENV:-}" != "production"');
      expect(checkProductionSecrets).toContain("REQUIRE_PRODUCTION_SECRETS");
      for (const secret of [
        "JWT_SECRET",
        "AUTH_TOKEN",
        "SIG_KEY",
        "SIG_SALT",
      ]) {
        expect(checkProductionSecrets).toContain(secret);
      }
      for (const secret of ["INTERNAL_API_SECRET", "ALATA_GATEWAY_API_KEY"]) {
        expect(checkProductionSecrets).toContain(secret);
      }
      expect(checkProductionSecrets).toContain("contains a placeholder value");
      expect(checkProductionSecrets).toContain("openssl rand -hex 32");
    });
  });

  describe("document-manager", () => {
    test("single-user mode can list, upload, and delete documents", async () => {
      mockIsMultiUserMode.mockResolvedValue(false);
      const app = buildApp(systemEndpoints, workspaceEndpoints);

      await request(app).get("/system/local-files").expect(200);

      const upload = await request(app)
        .post("/workspace/smoke/upload-and-embed")
        .send({})
        .expect(200);
      expect(upload.body).toMatchObject({ success: true, error: null });

      await request(app)
        .delete("/workspace/smoke/remove-and-unembed")
        .send({ documentLocation: "custom-documents/smoke-upload.txt.json" })
        .expect(200);
    });

    test("multi-user workspace member can list, upload, and delete own workspace documents", async () => {
      process.env.NODE_ENV = "production";
      mockIsMultiUserMode.mockResolvedValue(true);
      const app = buildApp(systemEndpoints, workspaceEndpoints);
      const auth = `Bearer ${tokenFor(1)}`;

      await request(app)
        .get("/system/local-files")
        .set("Authorization", auth)
        .expect(200);

      const upload = await request(app)
        .post("/workspace/smoke/upload-and-embed")
        .set("Authorization", auth)
        .send({})
        .expect(200);
      expect(upload.body).toMatchObject({ success: true, error: null });

      await request(app)
        .delete("/workspace/smoke/remove-and-unembed")
        .set("Authorization", auth)
        .send({ documentLocation: "custom-documents/smoke-upload.txt.json" })
        .expect(200);
    });
  });

  describe("notifications", () => {
    test("single-user unread-count returns zero instead of 401", async () => {
      mockIsMultiUserMode.mockResolvedValue(false);
      const app = buildApp(notificationEndpoints);

      const response = await request(app)
        .get("/notifications/unread-count")
        .expect(200);

      expect(response.body).toEqual({ success: true, count: 0 });
      expect(mockNotificationGetUnreadCount).not.toHaveBeenCalled();
    });

    test("multi-user unread-count returns the authenticated user count", async () => {
      process.env.NODE_ENV = "production";
      mockIsMultiUserMode.mockResolvedValue(true);
      const app = buildApp(notificationEndpoints);

      const response = await request(app)
        .get("/notifications/unread-count")
        .set("Authorization", `Bearer ${tokenFor(1)}`)
        .expect(200);

      expect(response.body).toEqual({ success: true, count: 2 });
      expect(mockNotificationGetUnreadCount).toHaveBeenCalledWith(1);
    });
  });

  describe("workspace-isolation", () => {
    test("multi-user non-member cannot read another user's image asset", async () => {
      process.env.NODE_ENV = "production";
      mockIsMultiUserMode.mockResolvedValue(true);
      mockWorkspaceUserFindFirst.mockResolvedValue(null);
      const app = buildApp(workspaceImagesEndpoints);

      const response = await request(app)
        .get("/images/assets/asset-1/file")
        .set("Authorization", `Bearer ${tokenFor(2)}`)
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: "Forbidden: not a workspace member",
      });
    });

    test("single-user mode keeps image asset access compatible", async () => {
      mockIsMultiUserMode.mockResolvedValue(false);
      const app = buildApp(workspaceImagesEndpoints);

      await request(app).get("/images/assets/any-asset/file").expect(200);
    });
  });

  describe("runtime-branding", () => {
    test("system and workspace runtime responses do not expose disallowed upstream branding", async () => {
      const app = buildApp(systemEndpoints, workspaceEndpoints);

      const setup = await request(app).get("/setup-complete").expect(200);
      const workspaces = await request(app).get("/workspaces").expect(200);
      const localFiles = await request(app)
        .get("/system/local-files")
        .expect(200);

      expectNoRuntimeBranding(setup.body, "/setup-complete");
      expectNoRuntimeBranding(workspaces.body, "/workspaces");
      expectNoRuntimeBranding(localFiles.body, "/system/local-files");
    });

    test("embed widget bundle only contains allowlisted compatibility branding", async () => {
      const bundlePath = path.resolve(
        __dirname,
        "../../../embed/dist/anythingllm-chat-widget.js"
      );
      const bundle = await fs.readFile(bundlePath, "utf8");
      const matches = [...bundle.matchAll(/anythingllm/gi)].map((match) => {
        const start = Math.max(0, match.index - 80);
        const end = Math.min(bundle.length, match.index + 80);
        return bundle.slice(start, end);
      });

      const disallowed = matches.filter(
        (context) => !isAllowed(`${bundlePath}:${context}`)
      );
      expect(disallowed).toEqual([]);
    });
  });
});
