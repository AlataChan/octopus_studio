const { randomUUID } = require("crypto");
const prisma = require("../utils/prisma");
const { redactFdeValue } = require("../utils/fde/redaction");

class FdeRunCheckpointError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.name = "FdeRunCheckpointError";
    this.code = code;
    this.status = status;
    this.path = "checkpoint";
  }
}

function serializedOutputs(value) {
  return JSON.stringify(redactFdeValue(value || {}, { maxDepth: 64 }));
}

function parsedCheckpoint(row) {
  if (!row) return null;
  let nodeOutputs = {};
  try {
    nodeOutputs =
      typeof row.nodeOutputs === "string"
        ? JSON.parse(row.nodeOutputs)
        : row.nodeOutputs || {};
  } catch {
    throw new FdeRunCheckpointError("STUDIO_CHECKPOINT_INVALID");
  }
  return { ...row, nodeOutputs };
}

function leaseEnd(now, leaseMs) {
  return new Date(now.getTime() + leaseMs);
}

async function updatedRow(runId, result) {
  if (result.count !== 1) {
    throw new FdeRunCheckpointError("STUDIO_CHECKPOINT_CONFLICT");
  }
  return parsedCheckpoint(
    await prisma.fde_run_checkpoints.findUnique({ where: { runId } })
  );
}

const FdeRunCheckpoint = {
  async get(runId) {
    return parsedCheckpoint(
      await prisma.fde_run_checkpoints.findUnique({
        where: { runId: String(runId) },
      })
    );
  },

  async create({ runId, nodeCursor, inputDigest, nodeOutputs = {} }) {
    return parsedCheckpoint(
      await prisma.fde_run_checkpoints.create({
        data: {
          runId: String(runId),
          nodeCursor: String(nodeCursor),
          nodeOutputs: serializedOutputs(nodeOutputs),
          inputDigest: String(inputDigest),
          attemptToken: randomUUID(),
          status: "idle",
        },
      })
    );
  },

  async claim({
    runId,
    stateVersion,
    leaseOwner,
    now = new Date(),
    leaseMs = 5 * 60_000,
    attemptToken = randomUUID(),
  }) {
    const result = await prisma.fde_run_checkpoints.updateMany({
      where: {
        runId: String(runId),
        stateVersion: Number(stateVersion),
        status: { in: ["idle", "leased"] },
        OR: [{ status: "idle" }, { leaseExpiresAt: { lt: now } }],
      },
      data: {
        status: "leased",
        leaseOwner: String(leaseOwner),
        leaseExpiresAt: leaseEnd(now, leaseMs),
        attemptToken,
        stateVersion: { increment: 1 },
      },
    });
    return updatedRow(String(runId), result);
  },

  async renew({
    runId,
    stateVersion,
    leaseOwner,
    attemptToken,
    now = new Date(),
    leaseMs = 5 * 60_000,
  }) {
    const result = await prisma.fde_run_checkpoints.updateMany({
      where: {
        runId: String(runId),
        stateVersion: Number(stateVersion),
        status: "leased",
        leaseOwner: String(leaseOwner),
        attemptToken: String(attemptToken),
      },
      data: {
        leaseExpiresAt: leaseEnd(now, leaseMs),
        stateVersion: { increment: 1 },
      },
    });
    return updatedRow(String(runId), result);
  },

  async storeAttemptResult(args) {
    return this.advance({ ...args, nodeCursor: args.nodeCursor });
  },

  async advance({
    runId,
    stateVersion,
    leaseOwner,
    attemptToken,
    nodeCursor,
    nodeOutputs,
    status = "leased",
    now = new Date(),
    leaseMs = 5 * 60_000,
  }) {
    const terminal = ["completed", "failed"].includes(status);
    const result = await prisma.fde_run_checkpoints.updateMany({
      where: {
        runId: String(runId),
        stateVersion: Number(stateVersion),
        status: "leased",
        leaseOwner: String(leaseOwner),
        attemptToken: String(attemptToken),
      },
      data: {
        nodeCursor: String(nodeCursor),
        nodeOutputs: serializedOutputs(nodeOutputs),
        status,
        leaseOwner: terminal ? null : String(leaseOwner),
        leaseExpiresAt: terminal ? null : leaseEnd(now, leaseMs),
        stateVersion: { increment: 1 },
      },
    });
    return updatedRow(String(runId), result);
  },

  async fail(args) {
    return this.advance({ ...args, status: "failed" });
  },
};

module.exports = {
  FdeRunCheckpoint,
  FdeRunCheckpointError,
  parsedCheckpoint,
};
