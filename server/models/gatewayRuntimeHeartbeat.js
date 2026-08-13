const prisma = require("../utils/prisma");
const { safeJsonParse } = require("../utils/http");

const GatewayRuntimeHeartbeat = {
  async create({ runtimeId, status = "healthy", metrics = null }) {
    return prisma.gateway_runtime_heartbeats.create({
      data: {
        runtimeId: String(runtimeId),
        status: String(status || "healthy"),
        metricsJson:
          metrics === null || metrics === undefined
            ? null
            : JSON.stringify(metrics),
      },
    });
  },

  async listRecent(runtimeId, limit = 20) {
    try {
      const rows = await prisma.gateway_runtime_heartbeats.findMany({
        where: { runtimeId: String(runtimeId) },
        orderBy: { observedAt: "desc" },
        take: Math.max(1, Number(limit) || 20),
      });

      return rows.map((row) => ({
        ...row,
        metrics: safeJsonParse(row.metricsJson, {}),
      }));
    } catch (error) {
      console.error(
        "[GatewayRuntimeHeartbeat] listRecent failed:",
        error.message
      );
      return [];
    }
  },
};

module.exports = { GatewayRuntimeHeartbeat };
