const mockReqBody = jest.fn((request) => request.body);
const mockUserFromSession = jest.fn();
const mockIsMultiUserMode = jest.fn();
const mockValidateTierMap = jest.fn();
const mockGetLLMProvider = jest.fn();
const mockLogEvent = jest.fn();
const mockFindMany = jest.fn();
const mockCreateToken = jest.fn();
const mockFindUniqueToken = jest.fn();
const mockUpdateManyToken = jest.fn();
const mockSystemUpsert = jest.fn();
const mockWorkspaceUpdateMany = jest.fn();
const mockTransaction = jest.fn();
const ORIGINAL_ENV = { ...process.env };

jest.mock("../../utils/http", () => ({
  reqBody: (...args) => mockReqBody(...args),
  userFromSession: (...args) => mockUserFromSession(...args),
  decodeJWT: jest.fn(() => ({ p: null, id: null })),
}));

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    isMultiUserMode: (...args) => mockIsMultiUserMode(...args),
  },
}));

jest.mock("../../utils/AiProviders/providerRouter/tierRouter", () => ({
  validateTierMap: (...args) => mockValidateTierMap(...args),
}));

jest.mock("../../utils/helpers", () => ({
  getLLMProvider: (...args) => mockGetLLMProvider(...args),
}));

jest.mock("../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: (...args) => mockLogEvent(...args),
  },
}));

jest.mock("../../utils/prisma", () => ({
  workspaces: {
    findMany: (...args) => mockFindMany(...args),
    updateMany: (...args) => mockWorkspaceUpdateMany(...args),
  },
  tier_routing_preview_tokens: {
    create: (...args) => mockCreateToken(...args),
    findUnique: (...args) => mockFindUniqueToken(...args),
    updateMany: (...args) => mockUpdateManyToken(...args),
  },
  system_settings: {
    upsert: (...args) => mockSystemUpsert(...args),
  },
  $transaction: (...args) => mockTransaction(...args),
}));

const { mockRequest, mockResponse } = require("../utils/testHelpers");

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((sorted, key) => {
      sorted[key] = sortValue(value[key]);
      return sorted;
    }, {});
}

function sha256(value) {
  return require("crypto")
    .createHash("sha256")
    .update(JSON.stringify(sortValue(value)))
    .digest("hex");
}

const VALID_TIER_MAP = Object.freeze({
  C0: { provider: "openai", model: "gpt-4o-mini" },
});

const VALID_TIER_MAP_HASH = sha256(VALID_TIER_MAP);
const VALID_SNAPSHOT_HASH = sha256({
  affectedWorkspaceIds: [1],
  optedOutWorkspaceIds: [2],
});

function buildRoutes() {
  const routes = {};
  const app = {
    post: jest.fn((path, middleware, handler) => {
      routes[`POST ${path}`] = { middleware, handler };
    }),
  };
  const { tierRoutingEndpoints } = require("../../endpoints/tierRouting");
  tierRoutingEndpoints(app);
  return routes;
}

async function callRoute(route, body = {}, user = { id: 1, role: "admin" }) {
  mockUserFromSession.mockResolvedValue(user);
  const headers = {};
  const req = mockRequest({
    body,
    headers,
    method: "POST",
    header: jest.fn((name) => headers[String(name).toLowerCase()] || null),
  });
  const res = mockResponse();
  res.locals = {};

  for (const middleware of route.middleware || []) {
    let nextCalled = false;
    await middleware(req, res, (error) => {
      if (error) throw error;
      nextCalled = true;
    });
    if (!nextCalled) return res;
  }

  await route.handler(req, res);
  return res;
}

describe("tier routing admin endpoints", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "tier-routing-test-secret";
    process.env.AUTH_TOKEN = "tier-routing-auth-token";
    delete process.env.ANYTHING_LLM_RUNTIME;
    mockIsMultiUserMode.mockResolvedValue(false);
    mockValidateTierMap.mockReturnValue({
      ok: true,
      map: VALID_TIER_MAP,
    });
    mockFindMany.mockImplementation(async ({ where }) => {
      if (where?.disableTierRouting === false) {
        return [{ id: 1, chatProvider: "openai", chatModel: "gpt-4o" }];
      }
      if (where?.disableTierRouting === true) return [{ id: 2 }];
      if (where?.id?.in) {
        return where.id.in.map((id) => ({ id }));
      }
      return [];
    });
    mockCreateToken.mockResolvedValue({
      token: "preview-token",
      expiresAt: new Date(Date.now() + 600000),
    });
    mockFindUniqueToken.mockResolvedValue({
      token: "preview-token",
      adminUserId: 1,
      tierMapHash: VALID_TIER_MAP_HASH,
      snapshotHash: VALID_SNAPSHOT_HASH,
      expiresAt: new Date(Date.now() + 600000),
      consumedAt: null,
    });
    mockGetLLMProvider.mockReturnValue({
      isValidChatCompletionModel: jest.fn(() => true),
    });
    mockUpdateManyToken.mockResolvedValue({ count: 1 });
    mockSystemUpsert.mockResolvedValue({});
    mockWorkspaceUpdateMany.mockResolvedValue({ count: 2 });
    mockTransaction.mockImplementation(async (fn) =>
      typeof fn === "function" ? fn(require("../../utils/prisma")) : Promise.all(fn)
    );
    mockLogEvent.mockResolvedValue({ eventLog: { id: 1 }, message: null });
  });

  afterEach(() => {
    jest.useRealTimers();
    for (const key of [
      "NODE_ENV",
      "JWT_SECRET",
      "AUTH_TOKEN",
      "ANYTHING_LLM_RUNTIME",
    ]) {
      if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
      else process.env[key] = ORIGINAL_ENV[key];
    }
  });

  test("single-user production requests without auth are rejected before the handler", async () => {
    process.env.NODE_ENV = "production";
    const route = buildRoutes()["POST /admin/tier-routing/preview"];

    const res = await callRoute(route, {
      model_tier_map: { C0: { provider: "openai", model: "gpt-4o-mini" } },
    });

    expect(res.statusCode).toBe(401);
    expect(res.data).toEqual({ error: "No auth token found." });
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  test("preview validates the map, snapshots affected workspaces, and stores a token", async () => {
    const route = buildRoutes()["POST /admin/tier-routing/preview"];

    const res = await callRoute(route, {
      model_tier_map: { C0: { provider: "openai", model: "gpt-4o-mini" } },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.data).toEqual(
      expect.objectContaining({
        success: true,
        previewToken: "preview-token",
        affectedWorkspaceIds: [1],
        optedOutWorkspaceIds: [2],
      })
    );
    expect(mockCreateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          token: expect.any(String),
          adminUserId: 1,
          tierMapHash: expect.any(String),
          snapshotHash: expect.any(String),
          consumedAt: null,
        }),
      })
    );
  });

  test.each([
    ["missing token", null, /previewToken is required/],
    [
      "expired token",
      { expiresAt: new Date(Date.now() - 1), consumedAt: null },
      /expired/,
    ],
    ["non issuer", { adminUserId: 99, consumedAt: null }, /requesting admin/],
    [
      "hash mismatch",
      { tierMapHash: "different", consumedAt: null },
      /tier map changed/,
    ],
  ])("enable rejects %s without consuming the token", async (_name, tokenPatch, error) => {
    const route = buildRoutes()["POST /admin/tier-routing/enable"];
    if (tokenPatch === null) {
      const res = await callRoute(route, {
        tierMap: { C0: { provider: "openai", model: "gpt-4o-mini" } },
      });
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toMatch(error);
    } else {
      mockFindUniqueToken.mockResolvedValue({
        token: "preview-token",
        adminUserId: 1,
        tierMapHash: VALID_TIER_MAP_HASH,
        snapshotHash: VALID_SNAPSHOT_HASH,
        expiresAt: new Date(Date.now() + 600000),
        ...tokenPatch,
      });

      const res = await callRoute(route, {
        previewToken: "preview-token",
        tierMap: { C0: { provider: "openai", model: "gpt-4o-mini" } },
      });

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toMatch(error);
    }
    expect(mockUpdateManyToken).not.toHaveBeenCalled();
  });

  test("enable rejects when the opt-out snapshot changed before token consumption", async () => {
    mockFindMany.mockImplementation(async ({ where }) => {
      if (where?.disableTierRouting === false) return [{ id: 1 }, { id: 3 }];
      if (where?.disableTierRouting === true) return [{ id: 2 }];
      return [];
    });
    const route = buildRoutes()["POST /admin/tier-routing/enable"];

    const res = await callRoute(route, {
      previewToken: "preview-token",
      tierMap: { C0: { provider: "openai", model: "gpt-4o-mini" } },
    });

    expect(res.statusCode).toBe(409);
    expect(res.data.error).toMatch(/workspace snapshot changed/);
    expect(mockUpdateManyToken).not.toHaveBeenCalled();
  });

  test("enable preflight failure rejects without token consumption", async () => {
    mockGetLLMProvider.mockImplementation(() => {
      throw new Error("bad credentials");
    });
    const route = buildRoutes()["POST /admin/tier-routing/enable"];

    const res = await callRoute(route, {
      previewToken: "preview-token",
      tierMap: { C0: { provider: "openai", model: "gpt-4o-mini" } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.data.error).toMatch(/preflight failed/);
    expect(res.data.diagnostics[0]).toEqual(
      expect.objectContaining({ ok: false, error: "bad credentials" })
    );
    expect(mockUpdateManyToken).not.toHaveBeenCalled();
  });

  test("enable rejects when async model validation resolves false", async () => {
    mockGetLLMProvider.mockReturnValue({
      isValidChatCompletionModel: jest.fn(async () => false),
    });
    const route = buildRoutes()["POST /admin/tier-routing/enable"];

    const res = await callRoute(route, {
      previewToken: "preview-token",
      tierMap: { C0: { provider: "openai", model: "gpt-4o-mini" } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.data.error).toMatch(/preflight failed/);
    expect(res.data.diagnostics[0]).toEqual(
      expect.objectContaining({
        ok: false,
        error: "model is not valid for chat completion",
      })
    );
    expect(mockUpdateManyToken).not.toHaveBeenCalled();
  });

  test("enable rejects when preflight model validation times out", async () => {
    jest.useFakeTimers();
    mockGetLLMProvider.mockReturnValue({
      isValidChatCompletionModel: jest.fn(() => new Promise(() => {})),
    });
    const route = buildRoutes()["POST /admin/tier-routing/enable"];

    const pending = callRoute(route, {
      previewToken: "preview-token",
      tierMap: { C0: { provider: "openai", model: "gpt-4o-mini" } },
    });
    await jest.advanceTimersByTimeAsync(5_000);
    const res = await pending;

    expect(res.statusCode).toBe(400);
    expect(res.data.error).toMatch(/preflight failed/);
    expect(res.data.diagnostics[0]).toEqual(
      expect.objectContaining({
        ok: false,
        error: "model validation timed out after 5000ms",
      })
    );
    expect(mockUpdateManyToken).not.toHaveBeenCalled();
  });

  test("preview and enable use the same single-user identity when no user id exists", async () => {
    const previewRoute = buildRoutes()["POST /admin/tier-routing/preview"];

    await callRoute(
      previewRoute,
      {
        tierMap: { C0: { provider: "openai", model: "gpt-4o-mini" } },
      },
      null
    );
    expect(mockCreateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ adminUserId: 0 }),
      })
    );

    mockFindUniqueToken.mockResolvedValue({
      token: "preview-token",
      adminUserId: 0,
      tierMapHash: VALID_TIER_MAP_HASH,
      snapshotHash: VALID_SNAPSHOT_HASH,
      expiresAt: new Date(Date.now() + 600000),
      consumedAt: null,
    });
    const enableRoute = buildRoutes()["POST /admin/tier-routing/enable"];

    const res = await callRoute(
      enableRoute,
      {
        previewToken: "preview-token",
        tierMap: { C0: { provider: "openai", model: "gpt-4o-mini" } },
      },
      null
    );

    expect(res.statusCode).toBe(200);
    expect(res.data.success).toBe(true);
    expect(mockUpdateManyToken).toHaveBeenCalled();
  });

  test("concurrent enable consumes the preview token atomically", async () => {
    mockUpdateManyToken
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const route = buildRoutes()["POST /admin/tier-routing/enable"];
    const body = {
      previewToken: "preview-token",
      tierMap: { C0: { provider: "openai", model: "gpt-4o-mini" } },
    };

    const first = await callRoute(route, body);
    const second = await callRoute(route, body);

    expect(first.data.success).toBe(true);
    expect(second.statusCode).toBe(409);
    expect(second.data.error).toMatch(/already consumed/);
  });

  test("bulk opt-out rolls back when any requested workspace id is missing", async () => {
    mockFindMany.mockResolvedValue([{ id: 1 }]);
    const route = buildRoutes()["POST /admin/tier-routing/bulk-optout"];

    const res = await callRoute(route, { workspaceIds: [1, 2, 2] });

    expect(res.statusCode).toBe(400);
    expect(res.data).toEqual(
      expect.objectContaining({
        success: false,
        missingWorkspaceIds: [2],
      })
    );
    expect(mockWorkspaceUpdateMany).not.toHaveBeenCalled();
  });
});
