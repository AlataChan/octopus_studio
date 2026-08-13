const fs = require("fs");
const { InMemoryStore, WorkflowsStorage } = require("@mastra/core/storage");

class JsonWorkflowStorage extends WorkflowsStorage {
  constructor({ filename, delegate, ready }) {
    super();
    this.filename = filename;
    this.delegate = delegate;
    this.ready = ready;
  }

  static async create(filename) {
    const memory = new InMemoryStore({ id: "m05-json-inner" });
    const delegate = await memory.getStore("workflows");
    let resolveReady;
    const ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
    const storage = new JsonWorkflowStorage({ filename, delegate, ready });
    await storage.hydrate();
    resolveReady();
    return storage;
  }

  supportsConcurrentUpdates() {
    return false;
  }

  async hydrate() {
    if (!fs.existsSync(this.filename)) return;
    const records = JSON.parse(fs.readFileSync(this.filename, "utf-8"));
    for (const record of records) {
      await this.delegate.persistWorkflowSnapshot({
        ...record,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      });
    }
  }

  async flush() {
    const { runs } = await this.delegate.listWorkflowRuns();
    const records = runs.map((run) => ({
      workflowName: run.workflowName,
      runId: run.runId,
      resourceId: run.resourceId,
      snapshot: run.snapshot,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    }));
    const temporary = `${this.filename}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(records), "utf-8");
    fs.renameSync(temporary, this.filename);
  }

  async dangerouslyClearAll() {
    await this.ready;
    await this.delegate.dangerouslyClearAll();
    await this.flush();
  }

  async updateWorkflowResults(args) {
    await this.ready;
    const result = await this.delegate.updateWorkflowResults(args);
    await this.flush();
    return result;
  }

  async updateWorkflowState(args) {
    await this.ready;
    const result = await this.delegate.updateWorkflowState(args);
    await this.flush();
    return result;
  }

  async persistWorkflowSnapshot(args) {
    await this.ready;
    await this.delegate.persistWorkflowSnapshot(args);
    await this.flush();
  }

  async loadWorkflowSnapshot(args) {
    await this.ready;
    return this.delegate.loadWorkflowSnapshot(args);
  }

  async listWorkflowRuns(args) {
    await this.ready;
    return this.delegate.listWorkflowRuns(args);
  }

  async getWorkflowRunById(args) {
    await this.ready;
    return this.delegate.getWorkflowRunById(args);
  }

  async deleteWorkflowRunById(args) {
    await this.ready;
    await this.delegate.deleteWorkflowRunById(args);
    await this.flush();
  }
}

module.exports = { JsonWorkflowStorage };
