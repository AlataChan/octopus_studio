const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RUNNER = path.resolve(
  __dirname,
  "../../../utils/fde/spike-m05/spikeRunner.js"
);

function runProbe(...args) {
  return JSON.parse(
    execFileSync("node", [RUNNER, ...args], {
      encoding: "utf-8",
      env: { PATH: process.env.PATH },
    })
  );
}

function spawnUntilJson(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [RUNNER, ...args], {
      env: { PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`M0.5 child did not become ready: ${stderr}`));
    }, 10_000);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const newline = stdout.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timeout);
      resolve({ child, record: JSON.parse(stdout.slice(0, newline)) });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function killChild(child) {
  return new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
    child.kill("SIGKILL");
  });
}

describe("Mastra M0.5 value spike", () => {
  describe("conditional branching", () => {
    it("executes the same validated conditional with both orchestrators", () => {
      const result = runProbe("branch");

      expect(result.own.output).toEqual(result.mastra.output);
      expect(result.own.output).toEqual({
        route: "urgent",
        message: "ticket T-42 uses model model-urgent",
      });
      expect(result.own.trace.map((event) => event.event)).toEqual([
        "condition.start",
        "condition.end",
      ]);
      expect(result.mastra.trace).toEqual(result.own.trace);
      expect(result.own.sloc).toBeGreaterThan(0);
      expect(result.mastra.sloc).toBeGreaterThan(0);
      expect(result.shared.sloc).toBeGreaterThan(0);
    });

    it("keeps validation fail-closed before either engine executes", () => {
      const result = runProbe("branch-invalid");

      expect(result).toEqual({
        own: "M05_UNSUPPORTED_CONDITION",
        mastra: "M05_UNSUPPORTED_CONDITION",
      });
    });
  });

  describe("durable suspend and resume", () => {
    const tempDirs = [];

    afterEach(() => {
      while (tempDirs.length) {
        fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
      }
    });

    it("stores a Mastra snapshot for in-process suspend/resume", () => {
      const result = runProbe("resume-in-memory");

      expect(result.started).toBe("suspended");
      expect(result.suspendedStep).toBe("approval");
      expect(result.snapshotStatus).toBe("suspended");
      expect(result.snapshotBytes).toBeGreaterThan(100);
      expect(result.activeBeforeRestart).toBe(0);
      expect(result.statusAfterRestartAll).toBe("suspended");
      expect(result.resumed).toEqual({
        status: "success",
        result: { value: 8 },
      });
      expect(result.waitForEvent).toBe("WORKFLOW_WAIT_FOR_EVENT_REMOVED");
    });

    it("cannot resume in a fresh process when no workflow storage exists", async () => {
      const first = await spawnUntilJson(
        "resume-hold",
        "none",
        "run-no-storage"
      );
      expect(first.record).toEqual({ phase: "suspended", status: "suspended" });

      const killed = await killChild(first.child);
      expect(killed).toEqual({ code: null, signal: "SIGKILL" });
      expect(runProbe("resume-fresh", "none", "run-no-storage")).toEqual({
        status: "error",
        error: "NOT_SUSPENDED",
      });
    });

    it("cannot resume through a configured no-op workflow store", async () => {
      const first = await spawnUntilJson(
        "resume-hold",
        "noop",
        "run-noop-storage"
      );
      expect(first.record).toEqual({ phase: "suspended", status: "suspended" });

      const killed = await killChild(first.child);
      expect(killed.signal).toBe("SIGKILL");
      expect(runProbe("resume-fresh", "noop", "run-noop-storage")).toEqual({
        status: "error",
        error: "NO_SNAPSHOT",
      });
    });

    it("resumes after SIGKILL only when a custom store persists Mastra snapshots", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mastra-m05-"));
      tempDirs.push(dir);
      const snapshotFile = path.join(dir, "workflow-snapshots.json");
      const first = await spawnUntilJson(
        "resume-hold",
        snapshotFile,
        "run-file-storage"
      );
      expect(first.record.status).toBe("suspended");
      expect(first.record.persistedSnapshotBytes).toBeGreaterThan(100);

      const killed = await killChild(first.child);
      expect(killed.signal).toBe("SIGKILL");
      expect(
        runProbe("resume-fresh", snapshotFile, "run-file-storage")
      ).toEqual({
        status: "success",
        result: { value: 8 },
        storageKind: "full-mastra-snapshot",
      });
    });
  });

  describe("bounded loops", () => {
    it("shows that Mastra loop builders ignore an IR-style maxIterations option", () => {
      const result = runProbe("loops");

      expect(result.requestedMax).toBe(2);
      expect(result.dowhileIterations).toBe(5);
      expect(result.dountilIterations).toBe(5);
      expect(result.foreachIterations).toBe(4);
    });

    it("fails closed only when Studio adds its own iteration guard", () => {
      const result = runProbe("loops");

      expect(result.guarded).toEqual({
        status: "failed",
        error: "M05_LOOP_MAX_ITERATIONS",
        attempts: 3,
      });
      expect(result.errorEchoedPayload).toBe(false);
    });
  });
});
