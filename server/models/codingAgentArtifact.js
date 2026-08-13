const prisma = require("../utils/prisma");

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function formatArtifact(artifact) {
  if (!artifact) return null;
  return {
    ...artifact,
    metadata: parseJson(artifact.metadata),
  };
}

const CodingAgentArtifact = {
  ARTIFACT_TYPE: {
    PATCH: "patch",
    LOG: "log",
  },

  async create({
    runId,
    artifactType,
    storageRef,
    label = null,
    mimeType = null,
    sizeBytes = null,
    metadata = {},
  }) {
    const artifact = await prisma.coding_agent_artifacts.create({
      data: {
        runId,
        artifactType,
        storageRef,
        label,
        mimeType,
        sizeBytes,
        metadata: JSON.stringify(metadata || {}),
      },
    });
    return formatArtifact(artifact);
  },

  async listByRun(runId) {
    const artifacts = await prisma.coding_agent_artifacts.findMany({
      where: { runId },
      orderBy: { createdAt: "asc" },
    });
    return artifacts.map(formatArtifact);
  },

  async getById(id) {
    return formatArtifact(
      await prisma.coding_agent_artifacts.findUnique({ where: { id } })
    );
  },
};

module.exports = {
  CodingAgentArtifact,
};
