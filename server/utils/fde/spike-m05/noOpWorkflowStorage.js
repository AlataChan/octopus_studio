const { WorkflowsStorage } = require("@mastra/core/storage");

class NoOpWorkflowStorage extends WorkflowsStorage {
  supportsConcurrentUpdates() {
    return false;
  }

  async dangerouslyClearAll() {}

  async updateWorkflowResults() {
    return {};
  }

  async updateWorkflowState() {
    return undefined;
  }

  async persistWorkflowSnapshot() {}

  async loadWorkflowSnapshot() {
    return null;
  }

  async listWorkflowRuns() {
    return { runs: [], total: 0 };
  }

  async getWorkflowRunById() {
    return null;
  }

  async deleteWorkflowRunById() {}
}

module.exports = { NoOpWorkflowStorage };
