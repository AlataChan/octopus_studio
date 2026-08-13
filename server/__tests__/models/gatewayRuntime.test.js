jest.mock("../../utils/prisma", () => ({
  gateway_runtimes: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  gateway_runtime_heartbeats: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { GatewayRuntime } = require("../../models/gatewayRuntime");

describe("GatewayRuntime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("registers a runtime and returns a one-time bootstrap token", async () => {
    prisma.gateway_runtimes.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      createdAt: new Date("2026-03-08T00:00:00.000Z"),
      updatedAt: new Date("2026-03-08T00:00:00.000Z"),
    }));

    const { runtime, bootstrapToken } = await GatewayRuntime.register({
      id: "gw_local_1",
      name: "Local Gateway",
      mode: "embedded",
      authToken: "secret-token",
    });

    expect(prisma.gateway_runtimes.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.gateway_runtimes.upsert.mock.calls[0][0].create.id).toBe(
      "gw_local_1"
    );
    expect(
      prisma.gateway_runtimes.upsert.mock.calls[0][0].create.authTokenHash
    ).toEqual(expect.any(String));
    expect(
      prisma.gateway_runtimes.upsert.mock.calls[0][0].create.authTokenHash
    ).not.toBe("secret-token");

    expect(runtime.id).toBe("gw_local_1");
    expect(runtime.authTokenHash).toBeUndefined();
    expect(typeof bootstrapToken).toBe("string");
    expect(bootstrapToken.length).toBeGreaterThan(10);
  });

  test("exchanges a bootstrap token for an active access token", async () => {
    prisma.gateway_runtimes.findUnique.mockResolvedValue({
      id: "gw_local_1",
      name: "Local Gateway",
      mode: "embedded",
      status: "offline",
      authTokenHash: await GatewayRuntime.hashToken("bootstrap-token"),
      capabilitiesJson: null,
      metadataJson: null,
      lastHeartbeatAt: null,
      createdAt: new Date("2026-03-08T00:00:00.000Z"),
      updatedAt: new Date("2026-03-08T00:00:00.000Z"),
    });
    prisma.gateway_runtimes.update.mockImplementation(async ({ data }) => ({
      id: "gw_local_1",
      name: "Local Gateway",
      mode: "embedded",
      status: data.status,
      authTokenHash: data.authTokenHash,
      capabilitiesJson: null,
      metadataJson: null,
      lastHeartbeatAt: null,
      createdAt: new Date("2026-03-08T00:00:00.000Z"),
      updatedAt: new Date("2026-03-08T00:00:01.000Z"),
    }));

    const result = await GatewayRuntime.exchangeRegistration({
      runtimeId: "gw_local_1",
      bootstrapToken: "bootstrap-token",
    });

    expect(prisma.gateway_runtimes.findUnique).toHaveBeenCalledWith({
      where: { id: "gw_local_1" },
    });
    expect(prisma.gateway_runtimes.update).toHaveBeenCalledTimes(1);
    expect(result.runtime.status).toBe("active");
    expect(typeof result.accessToken).toBe("string");
    expect(result.accessToken.length).toBeGreaterThan(10);
  });

  test("marks heartbeat without exposing auth hashes", async () => {
    prisma.gateway_runtimes.findUnique.mockResolvedValue({
      id: "gw_local_1",
      name: "Local Gateway",
      mode: "embedded",
      status: "active",
      authTokenHash: await GatewayRuntime.hashToken("active-token"),
      capabilitiesJson: null,
      metadataJson: null,
      lastHeartbeatAt: null,
      createdAt: new Date("2026-03-08T00:00:00.000Z"),
      updatedAt: new Date("2026-03-08T00:00:00.000Z"),
    });
    prisma.gateway_runtime_heartbeats.create.mockResolvedValue({
      id: 1,
      runtimeId: "gw_local_1",
      status: "healthy",
      metricsJson: JSON.stringify({ queueDepth: 0 }),
      observedAt: new Date("2026-03-08T00:00:02.000Z"),
    });
    prisma.gateway_runtimes.update.mockResolvedValue({
      id: "gw_local_1",
      name: "Local Gateway",
      mode: "embedded",
      status: "healthy",
      authTokenHash: "hidden",
      capabilitiesJson: null,
      metadataJson: null,
      lastHeartbeatAt: new Date("2026-03-08T00:00:02.000Z"),
      createdAt: new Date("2026-03-08T00:00:00.000Z"),
      updatedAt: new Date("2026-03-08T00:00:02.000Z"),
    });

    const runtime = await GatewayRuntime.markHeartbeat({
      runtimeId: "gw_local_1",
      accessToken: "active-token",
      status: "healthy",
      metrics: { queueDepth: 0 },
    });

    expect(prisma.gateway_runtime_heartbeats.create).toHaveBeenCalledWith({
      data: {
        runtimeId: "gw_local_1",
        status: "healthy",
        metricsJson: JSON.stringify({ queueDepth: 0 }),
      },
    });
    expect(runtime.status).toBe("healthy");
    expect(runtime.authTokenHash).toBeUndefined();
  });
});
