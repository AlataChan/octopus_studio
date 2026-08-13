const { LocalExecutionRuntime } = require("../../workAgent/tools/localExecution");
const { createExecutionPolicy } = require("../../workAgent/security/policy");
const { generatePatchArtifact } = require("./patchArtifact");
const { createSandboxWorkspace } = require("./sandboxWorkspace");

class CodingSession {
  constructor({ workspace, runtime }) {
    this.workspace = workspace;
    this.runtime = runtime;
    this.finalResult = null;
  }

  static async create({
    sourceRepoPath,
    runId,
    storageRoot,
    allowedSourceRoots,
    policy = {},
  }) {
    const workspace = await createSandboxWorkspace({
      sourceRepoPath,
      runId,
      storageRoot,
      allowedSourceRoots,
    });
    const runtime = new LocalExecutionRuntime({
      policy: createExecutionPolicy({
        workspaceRoots: [workspace.sandboxPath],
        cwd: workspace.sandboxPath,
        ...policy,
      }),
    });
    await runtime.captureWorkspaceBaseline();
    return new CodingSession({ workspace, runtime });
  }

  verificationSummary(commandHistory = []) {
    const commands = Array.isArray(commandHistory) ? commandHistory : [];
    const verificationCommands = commands.filter((entry) =>
      /test|check|lint|jest|vitest|playwright/i.test(entry.command || "")
    );
    if (!verificationCommands.length) {
      return {
        status: "unverified",
        commands: [],
        reason: "No verification command was run.",
      };
    }
    const allPassed = verificationCommands.every(
      (entry) => entry.status === "passed" || entry.exitCode === 0
    );
    return {
      status: allPassed ? "verified" : "unverified",
      commands: verificationCommands,
      reason: allPassed
        ? "Verification commands passed."
        : "One or more verification commands did not run or did not pass.",
    };
  }

  buildFinalAnswer({ loopResult, patchArtifact, verification }) {
    const intro = loopResult?.finalText || "Coding run completed.";
    const changedFiles = patchArtifact?.changedFiles || 0;
    const lines = [intro.trim(), "", `Patch files changed: ${changedFiles}`];
    if (verification.status === "verified") {
      lines.push(
        "",
        "Verified changes:",
        ...verification.commands.map((entry) => `- ${entry.command}`)
      );
    } else {
      lines.push("", "Unverified changes:", `- ${verification.reason}`);
      for (const entry of verification.commands) {
        lines.push(`- ${entry.command}: ${entry.status || "unknown"}`);
      }
    }
    return lines.join("\n");
  }

  async finalizeRun({ loopResult = {}, commandHistory = [] } = {}) {
    const patchArtifact = await generatePatchArtifact({
      workspace: this.workspace,
      runtime: this.runtime,
    });
    const verification = this.verificationSummary(commandHistory);
    const finalAnswer = this.buildFinalAnswer({
      loopResult,
      patchArtifact,
      verification,
    });
    this.finalResult = {
      status: loopResult.status || "completed",
      finalText: loopResult.finalText || "",
      finalAnswer,
      patchArtifact,
      verification,
    };
    return this.finalResult;
  }
}

module.exports = {
  CodingSession,
};
