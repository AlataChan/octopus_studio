const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../utils/prisma");
const { safeJsonParse } = require("../utils/http");
const { GatewayRuntimeHeartbeat } = require("./gatewayRuntimeHeartbeat");

function normalizeJSON(input, fallback = {}) {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") {
    return JSON.stringify(safeJsonParse(input, fallback) || fallback);
  }
  return JSON.stringify(input);
}

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function parseRuntime(runtime) {
  if (!runtime) return null;
  return {
    ...runtime,
    capabilities: safeJsonParse(runtime.capabilitiesJson, {}),
    metadata: safeJsonParse(runtime.metadataJson, {}),
  };
}

function publicRuntimeShape(runtime) {
  if (!runtime) return null;
  const parsed = parseRuntime(runtime);
  return {
    id: parsed.id,
    name: parsed.name,
    mode: parsed.mode,
    status: parsed.status,
    capabilities: parsed.capabilities,
    metadata: parsed.metadata,
    lastHeartbeatAt: parsed.lastHeartbeatAt,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
}

const GatewayRuntime = {
  hashToken(token) {
    return bcrypt.hash(String(token), 10);
  },

  async register({
    id = crypto.randomUUID(),
    name,
    mode = "embedded",
    authToken = null,
    capabilities = {},
    metadata = {},
  }) {
    const bootstrapToken = authToken || generateToken();
    const authTokenHash = await this.hashToken(bootstrapToken);
    const runtime = await prisma.gateway_runtimes.upsert({
      where: { id: String(id) },
      create: {
        id: String(id),
        name: String(name || id),
        mode: String(mode || "embedded"),
        status: "offline",
        authTokenHash,
        capabilitiesJson: normalizeJSON(capabilities, {}),
        metadataJson: normalizeJSON(metadata, {}),
      },
      update: {
        name: String(name || id),
        mode: String(mode || "embedded"),
        status: "offline",
        authTokenHash,
        capabilitiesJson: normalizeJSON(capabilities, {}),
        metadataJson: normalizeJSON(metadata, {}),
      },
    });

    return {
      runtime: publicRuntimeShape(runtime),
      bootstrapToken,
    };
  },

  async list() {
    try {
      const runtimes = await prisma.gateway_runtimes.findMany({
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      });
      return runtimes.map(publicRuntimeShape);
    } catch (error) {
      console.error("[GatewayRuntime] list failed:", error.message);
      return [];
    }
  },

  async get(runtimeId) {
    try {
      const runtime = await prisma.gateway_runtimes.findUnique({
        where: { id: String(runtimeId) },
      });
      return publicRuntimeShape(runtime);
    } catch (error) {
      console.error("[GatewayRuntime] get failed:", error.message);
      return null;
    }
  },

  async getInternal(runtimeId) {
    try {
      return await prisma.gateway_runtimes.findUnique({
        where: { id: String(runtimeId) },
      });
    } catch (error) {
      console.error("[GatewayRuntime] getInternal failed:", error.message);
      return null;
    }
  },

  async authorize({ runtimeId, accessToken }) {
    const runtime = await this.getInternal(runtimeId);
    if (!runtime || !runtime.authTokenHash || !accessToken) return null;

    try {
      const valid = await bcrypt.compare(
        String(accessToken),
        runtime.authTokenHash
      );
      return valid ? runtime : null;
    } catch (error) {
      console.error("[GatewayRuntime] authorize failed:", error.message);
      return null;
    }
  },

  async exchangeRegistration({ runtimeId, bootstrapToken }) {
    const runtime = await this.authorize({
      runtimeId,
      accessToken: bootstrapToken,
    });

    if (!runtime) {
      throw new Error("INVALID_RUNTIME_TOKEN");
    }

    const accessToken = generateToken();
    const authTokenHash = await this.hashToken(accessToken);
    const updated = await prisma.gateway_runtimes.update({
      where: { id: String(runtimeId) },
      data: {
        status: "active",
        authTokenHash,
      },
    });

    return {
      runtime: publicRuntimeShape(updated),
      accessToken,
    };
  },

  async rotateToken(runtimeId) {
    const runtime = await this.getInternal(runtimeId);
    if (!runtime) return null;

    const bootstrapToken = generateToken();
    const authTokenHash = await this.hashToken(bootstrapToken);
    const updated = await prisma.gateway_runtimes.update({
      where: { id: String(runtimeId) },
      data: {
        status: "offline",
        authTokenHash,
      },
    });

    return {
      runtime: publicRuntimeShape(updated),
      bootstrapToken,
    };
  },

  async markHeartbeat({
    runtimeId,
    accessToken,
    status = "healthy",
    metrics = {},
  }) {
    const runtime = await this.authorize({ runtimeId, accessToken });
    if (!runtime) {
      throw new Error("INVALID_RUNTIME_TOKEN");
    }

    await GatewayRuntimeHeartbeat.create({
      runtimeId,
      status,
      metrics,
    });

    const updated = await prisma.gateway_runtimes.update({
      where: { id: String(runtimeId) },
      data: {
        status: String(status || "healthy"),
        lastHeartbeatAt: new Date(),
      },
    });

    return publicRuntimeShape(updated);
  },

  toPublic(runtime) {
    return publicRuntimeShape(runtime);
  },
};

module.exports = { GatewayRuntime };
