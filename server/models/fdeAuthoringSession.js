const prisma = require("../utils/prisma");

class FdeAuthoringSessionError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.name = "FdeAuthoringSessionError";
    this.code = code;
    this.status = status;
    this.path = "authoringSession";
  }
}

const FdeAuthoringSession = {
  async create({ workspaceId, fdeSessionId, createdByUserId = null }) {
    return prisma.fde_authoring_sessions.create({
      data: {
        workspaceId: Number(workspaceId),
        fdeSessionId: String(fdeSessionId),
        createdByUserId,
      },
    });
  },

  async getInWorkspace(id, workspaceId) {
    return prisma.fde_authoring_sessions.findFirst({
      where: { id: String(id), workspaceId: Number(workspaceId) },
    });
  },

  async recordTurn(id, turnId) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.fde_authoring_sessions.findUnique({
        where: { id: String(id) },
      });
      if (!current) {
        throw new FdeAuthoringSessionError(
          "STUDIO_AUTHORING_SESSION_NOT_FOUND",
          404
        );
      }
      const updated = await tx.fde_authoring_sessions.updateMany({
        where: { id: current.id, fdeToTurnId: current.fdeToTurnId },
        data: {
          fdeFromTurnId: current.fdeToTurnId,
          fdeToTurnId: String(turnId),
        },
      });
      if (updated.count !== 1) {
        throw new FdeAuthoringSessionError("STUDIO_AUTHORING_SESSION_CONFLICT");
      }
      return tx.fde_authoring_sessions.findUnique({
        where: { id: current.id },
      });
    });
  },
};

module.exports = { FdeAuthoringSession, FdeAuthoringSessionError };
