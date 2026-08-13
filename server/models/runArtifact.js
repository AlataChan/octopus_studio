const prisma = require("../utils/prisma");
const { redactFdeValue } = require("../utils/fde/redaction");

const RunArtifact = {
  ARTIFACT_TYPE: {
    BROWSER_SNAPSHOT: "browser_snapshot",
    BROWSER_SCREENSHOT: "browser_screenshot",
    BROWSER_LOG: "browser_log",
    DOWNLOAD_FILE: "download_file",
    IMAGE_OUTPUT: "image_output",
    REPORT: "report",
    PATCH: "patch",
    RUNBOOK: "runbook",
    WORK_FILE: "work_file",
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
    return prisma.run_artifacts.create({
      data: {
        runId,
        artifactType,
        storageRef,
        label,
        mimeType,
        sizeBytes,
        metadata: JSON.stringify(redactFdeValue(metadata, { maxDepth: 64 })),
      },
    });
  },

  async listByRun(runId) {
    return prisma.run_artifacts.findMany({
      where: { runId },
      orderBy: { createdAt: "asc" },
    });
  },

  async getById(id) {
    return prisma.run_artifacts.findUnique({ where: { id } });
  },
};

module.exports = { RunArtifact };
