process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

const mockListRuntimes = jest.fn();
const mockRegisterRuntime = jest.fn();
const mockExchangeRegistration = jest.fn();
const mockMarkHeartbeat = jest.fn();
const mockRotateToken = jest.fn();
const mockAuthorizeRuntime = jest.fn();

jest.mock("../../models/gatewayRuntime", () => ({
  GatewayRuntime: {
    list: (...args) => mockListRuntimes(...args),
    register: (...args) => mockRegisterRuntime(...args),
    exchangeRegistration: (...args) => mockExchangeRegistration(...args),
    markHeartbeat: (...args) => mockMarkHeartbeat(...args),
    rotateToken: (...args) => mockRotateToken(...args),
    authorize: (...args) => mockAuthorizeRuntime(...args),
  },
}));

const mockAccountList = jest.fn();
const mockGetAccount = jest.fn();
const mockParseSecrets = jest.fn();
jest.mock("../../models/channelAccount", () => ({
  ChannelAccount: {
    list: (...args) => mockAccountList(...args),
    get: (...args) => mockGetAccount(...args),
    parseSecrets: (...args) => mockParseSecrets(...args),
    toPublic: (account) => account,
  },
}));

const mockBindingList = jest.fn();
jest.mock("../../models/channelBinding", () => ({
  ChannelBinding: {
    list: (...args) => mockBindingList(...args),
  },
}));

jest.mock("../../utils/imGateway", () => ({
  imGatewayService: {
    verifyWebhook: jest.fn(),
    acceptInbound: jest.fn(),
    getHealth: jest.fn(() => ({ status: "ok" })),
  },
}));

jest.mock("../../utils/imGateway/security/audit", () => ({
  runSecurityAudit: jest.fn(async () => ({ findings: [] })),
}));

describe("IM Gateway runtime endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRoutes() {
    const routes = {};
    const app = {
      get: jest.fn((path, middlewareOrHandler, handler) => {
        routes[`GET ${path}`] = { middleware, handler };
      }),
      post: jest.fn((path, middlewareOrHandler, handler) => {
        routes[`POST ${path}`] = { middleware, handler };
      }),
    };
    app.get.mockImplementation((path, middlewareOrHandler, handler) => {
      routes[`GET ${path}`] = {
        middleware:
          typeof middlewareOrHandler === "function" ? [] : middlewareOrHandler,
        handler:
          typeof middlewareOrHandler === "function"
            ? middlewareOrHandler
            : handler,
      };
    });
    app.post.mockImplementation((path, middlewareOrHandler, handler) => {
      routes[`POST ${path}`] = {
        middleware:
          typeof middlewareOrHandler === "function" ? [] : middlewareOrHandler,
        handler:
          typeof middlewareOrHandler === "function"
            ? middlewareOrHandler
            : handler,
      };
    });

    const { imGatewayEndpoints } = require("../../endpoints/imGateway");
    imGatewayEndpoints(app);

    return routes;
  }

  test("lists runtimes for admin control plane", async () => {
    mockListRuntimes.mockResolvedValue([
      { id: "gw_local_1", name: "Local Gateway", status: "active" },
    ]);
    const routes = buildRoutes();
    const route = routes["GET /im-gateway/runtimes"];
    const req = mockRequest();
    const res = mockResponse();

    await route.handler(req, res);

    expect(mockListRuntimes).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      runtimes: [{ id: "gw_local_1", name: "Local Gateway", status: "active" }],
    });
  });

  test("creates a runtime and returns a bootstrap token once", async () => {
    mockRegisterRuntime.mockResolvedValue({
      runtime: { id: "gw_local_1", name: "Local Gateway", status: "offline" },
      bootstrapToken: "bootstrap-token",
    });
    const routes = buildRoutes();
    const route = routes["POST /im-gateway/runtimes"];
    const req = mockRequest({
      body: { id: "gw_local_1", name: "Local Gateway", mode: "embedded" },
    });
    const res = mockResponse();

    await route.handler(req, res);

    expect(mockRegisterRuntime).toHaveBeenCalledWith({
      id: "gw_local_1",
      name: "Local Gateway",
      mode: "embedded",
      capabilities: {},
      metadata: {},
      authToken: null,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      runtime: { id: "gw_local_1", name: "Local Gateway", status: "offline" },
      bootstrapToken: "bootstrap-token",
    });
  });

  test("registers a runtime exchange and returns an access token", async () => {
    mockExchangeRegistration.mockResolvedValue({
      runtime: { id: "gw_local_1", status: "active" },
      accessToken: "active-token",
    });
    const routes = buildRoutes();
    const route = routes["POST /im-gateway/runtimes/:id/register"];
    const req = mockRequest({
      params: { id: "gw_local_1" },
      body: { bootstrapToken: "bootstrap-token" },
    });
    const res = mockResponse();

    await route.handler(req, res);

    expect(mockExchangeRegistration).toHaveBeenCalledWith({
      runtimeId: "gw_local_1",
      bootstrapToken: "bootstrap-token",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      runtime: { id: "gw_local_1", status: "active" },
      accessToken: "active-token",
    });
  });

  test("accepts heartbeat and returns runtime config snapshot", async () => {
    mockMarkHeartbeat.mockResolvedValue({
      id: "gw_local_1",
      status: "healthy",
      lastHeartbeatAt: new Date("2026-03-08T00:00:02.000Z"),
    });
    mockAuthorizeRuntime.mockResolvedValue({
      id: "gw_local_1",
      status: "healthy",
    });
    mockAccountList.mockResolvedValue([
      {
        provider: "feishu",
        accountId: "tenant_a",
        status: "active",
        updatedAt: new Date("2026-03-08T00:00:01.000Z"),
      },
    ]);
    mockParseSecrets.mockReturnValue({ appId: "app_123", appSecret: "secret" });
    mockBindingList.mockResolvedValue([
      {
        id: "binding_1",
        provider: "feishu",
        accountId: "tenant_a",
        workspaceId: 7,
        match: {},
        route: {},
        security: {},
        updatedAt: new Date("2026-03-08T00:00:03.000Z"),
      },
    ]);

    const routes = buildRoutes();

    const heartbeat = routes["POST /im-gateway/runtimes/:id/heartbeat"];
    const heartbeatReq = mockRequest({
      params: { id: "gw_local_1" },
      headers: { authorization: "Bearer active-token" },
      body: { status: "healthy", metrics: { queueDepth: 0 } },
      header(name) {
        return this.headers[String(name).toLowerCase()];
      },
    });
    const heartbeatRes = mockResponse();

    await heartbeat.handler(heartbeatReq, heartbeatRes);

    expect(mockMarkHeartbeat).toHaveBeenCalledWith({
      runtimeId: "gw_local_1",
      accessToken: "active-token",
      status: "healthy",
      metrics: { queueDepth: 0 },
    });
    expect(heartbeatRes.status).toHaveBeenCalledWith(200);

    const config = routes["GET /im-gateway/runtimes/:id/config"];
    const configReq = mockRequest({
      params: { id: "gw_local_1" },
      headers: { authorization: "Bearer active-token" },
      header(name) {
        return this.headers[String(name).toLowerCase()];
      },
    });
    const configRes = mockResponse();

    await config.handler(configReq, configRes);

    expect(mockAuthorizeRuntime).toHaveBeenCalledWith({
      runtimeId: "gw_local_1",
      accessToken: "active-token",
    });
    expect(mockAccountList).toHaveBeenCalledWith({ status: "active" });
    expect(mockBindingList).toHaveBeenCalledWith({ enabled: true });
    expect(configRes.status).toHaveBeenCalledWith(200);
    expect(configRes.json).toHaveBeenCalledWith({
      success: true,
      snapshot: expect.objectContaining({
        runtimeId: "gw_local_1",
        revision: 1772928003000,
        etag: 'W/"gwcfg-1772928003000"',
        accounts: [
          {
            provider: "feishu",
            accountId: "tenant_a",
            secrets: { appId: "app_123", appSecret: "secret" },
          },
        ],
        bindings: [
          expect.objectContaining({
            id: "binding_1",
            workspaceId: 7,
          }),
        ],
      }),
    });
  });

  test("returns decrypted account details for admin editing", async () => {
    mockGetAccount.mockResolvedValue({
      provider: "feishu",
      accountId: "tenant_a",
      status: "active",
    });
    mockParseSecrets.mockReturnValue({
      appId: "cli_app",
      appSecret: "cli_secret",
      verificationToken: "token",
    });

    const routes = buildRoutes();
    const route = routes["GET /im-gateway/accounts/:provider/:accountId"];
    const req = mockRequest({
      params: { provider: "feishu", accountId: "tenant_a" },
    });
    const res = mockResponse();

    await route.handler(req, res);

    expect(mockGetAccount).toHaveBeenCalledWith({
      provider: "feishu",
      accountId: "tenant_a",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      account: {
        provider: "feishu",
        accountId: "tenant_a",
        status: "active",
      },
      secrets: {
        appId: "cli_app",
        appSecret: "cli_secret",
        verificationToken: "token",
      },
    });
  });
});
