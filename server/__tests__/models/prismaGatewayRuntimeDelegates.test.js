process.env.NODE_ENV = "test";

const prisma = require("../../utils/prisma");

describe("Prisma client gateway runtime delegates", () => {
  test("exposes delegates required by the GatewayRuntime model", () => {
    expect(prisma.gateway_runtimes).toBeDefined();
    expect(prisma.gateway_runtime_heartbeats).toBeDefined();
  });
});
