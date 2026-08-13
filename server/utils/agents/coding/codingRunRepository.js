const { CodingAgentRun } = require("../../../models/codingAgentRun");
const { CodingAgentEvent } = require("../../../models/codingAgentEvent");
const { CodingAgentArtifact } = require("../../../models/codingAgentArtifact");

class PrismaCodingRunRepository {
  constructor({
    RunModel = CodingAgentRun,
    EventModel = CodingAgentEvent,
    ArtifactModel = CodingAgentArtifact,
  } = {}) {
    this.RunModel = RunModel;
    this.EventModel = EventModel;
    this.ArtifactModel = ArtifactModel;
  }

  async saveRun(run) {
    return this.RunModel.create({
      id: run.runId,
      userId: run.userId || null,
      workspaceId: run.workspaceId || null,
      sourceRepoPath: run.sourceRepoPath,
      sandboxPath: run.sandboxPath || null,
      status: run.status,
      provider: run.provider,
      model: run.model,
      maxTurns: run.maxTurns || 20,
      totalTurns: run.totalTurns || 0,
      totalCostUsd: run.totalCostUsd || 0,
      errorCode: run.errorCode || null,
      errorDetail: run.errorDetail || null,
      metadata: run.metadata || {},
    });
  }

  async updateRun(runId, patch = {}) {
    return this.RunModel.update(runId, patch);
  }

  async appendEvent(runId, type, payload = {}) {
    return this.EventModel.append({ runId, type, payload });
  }

  async saveArtifact(runId, artifact = {}) {
    return this.ArtifactModel.create({
      runId,
      artifactType: artifact.artifactType,
      storageRef: artifact.storageRef,
      label: artifact.label,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      metadata: artifact.metadata || {},
    });
  }

  async loadRun(runId) {
    const run = await this.RunModel.getById(runId);
    if (!run) return null;
    return {
      runId: run.id,
      status: run.status,
      provider: run.provider,
      model: run.model,
      totalTurns: run.totalTurns,
      totalCostUsd: run.totalCostUsd,
      sourceRepoPath: run.sourceRepoPath,
      sandboxPath: run.sandboxPath,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
      errorCode: run.errorCode,
      errorDetail: run.errorDetail,
      metadata: run.metadata || {},
      appliedAt: run.appliedAt,
    };
  }

  async listEvents(runId) {
    return this.EventModel.listByRun(runId);
  }

  async listNonTerminalRuns() {
    const runs = await this.RunModel.listNonTerminal();
    return runs.map((run) => ({
      runId: run.id,
      status: run.status,
      provider: run.provider,
      model: run.model,
      totalTurns: run.totalTurns,
      metadata: run.metadata || {},
    }));
  }

  async getRunForSandbox(sandboxPath) {
    if (!this.RunModel.getBySandboxPath) return null;
    const run = await this.RunModel.getBySandboxPath(sandboxPath);
    return run
      ? {
          runId: run.id,
          status: run.status,
          appliedAt: run.appliedAt,
          completedAt: run.completedAt,
        }
      : null;
  }
}

module.exports = {
  PrismaCodingRunRepository,
};
