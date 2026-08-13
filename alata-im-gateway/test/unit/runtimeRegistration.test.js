const nock = require("nock");
const { AlataClient } = require("../../src/client/AlataClient");
const { registerRuntimeCommand } = require("../../src/cli/commands/register");

describe("runtime registration flow", () => {
  const baseUrl = "http://alata.local";

  beforeEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.cleanAll();
    nock.restore();
  });

  test("registers runtime and receives an access token", async () => {
    const client = new AlataClient({
      baseUrl,
      apiKey: "api-key",
      internalSecret: "internal-secret",
      timeout: 5000,
    });

    const scope = nock(baseUrl)
      .post("/im-gateway/runtimes/rt-edge-1/register", {
        bootstrapToken: "bootstrap-123",
      })
      .reply(200, {
        success: true,
        runtime: { id: "rt-edge-1", status: "registered" },
        authToken: "runtime-token-abc",
      });

    const result = await client.registerRuntime({
      runtimeId: "rt-edge-1",
      bootstrapToken: "bootstrap-123",
    });

    expect(result).toEqual({
      runtime: { id: "rt-edge-1", status: "registered" },
      authToken: "runtime-token-abc",
    });
    scope.done();
  });

  test("fetches a versioned config snapshot with runtime auth", async () => {
    const client = new AlataClient({
      baseUrl,
      apiKey: "api-key",
      internalSecret: "internal-secret",
      timeout: 5000,
    });

    const scope = nock(baseUrl, {
      reqheaders: {
        authorization: "Bearer runtime-token-abc",
        "if-none-match": 'W/"gwcfg-7"',
      },
    })
      .get("/im-gateway/runtimes/rt-edge-1/config")
      .reply(200, {
        success: true,
        revision: 8,
        etag: 'W/"gwcfg-8"',
        config: {
          runtime: { id: "rt-edge-1", mode: "sidecar" },
          accounts: [{ provider: "wecom", accountId: "corp-main" }],
          bindings: [{ id: 11, provider: "wecom", workspaceId: 9 }],
        },
      });

    const result = await client.fetchRuntimeConfig({
      runtimeId: "rt-edge-1",
      runtimeToken: "runtime-token-abc",
      etag: 'W/"gwcfg-7"',
    });

    expect(result.revision).toBe(8);
    expect(result.config.bindings).toHaveLength(1);
    scope.done();
  });

  test("register command fails safely on auth error", async () => {
    const scope = nock(baseUrl)
      .post("/im-gateway/runtimes/rt-edge-1/register", {
        bootstrapToken: "bootstrap-123",
      })
      .reply(401, {
        success: false,
        error: "Invalid bootstrap token",
      });

    const stdout = { write: jest.fn() };
    const stderr = { write: jest.fn() };

    const exitCode = await registerRuntimeCommand(
      {
        runtimeId: "rt-edge-1",
        bootstrapToken: "bootstrap-123",
        baseUrl,
      },
      { stdout, stderr }
    );

    expect(exitCode).toBe(1);
    expect(stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("Invalid bootstrap token")
    );
    scope.done();
  });
});
