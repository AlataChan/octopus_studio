const path = require("path");
const {
  getShellEnv,
  findExecutable,
  checkNodeVersion,
  checkGitAvailable,
  getNodeDownloadUrl,
  getGitDownloadUrl,
} = require("./envHelper");
const {
  isPortOpen,
  waitForPort,
  spawnProcess,
  killProcess,
} = require("./processHelper");
const {
  DEFAULT_GATEWAY_PORT,
  getConfigPath,
  syncProviderConfig,
  getDashboardUrl,
  readConfig,
  updateGatewayPort,
} = require("./configHelper");

const GLOBAL_GATEWAY_BINARIES = ["alata-gateway", "alata-im-gateway"];
const LOCAL_GATEWAY_ENTRIES = [
  path.resolve(__dirname, "../../../alata-im-gateway/bin/alata-gateway.js"),
  path.resolve(__dirname, "../../../alata-im-gateway/src/index.js"),
];

function localGatewayCommandArgs(gatewayPath = "") {
  if (String(gatewayPath).endsWith("src/index.js")) {
    return [gatewayPath];
  }
  return [gatewayPath, "run"];
}

class OpenClawService {
  constructor() {
    this._gatewayProcess = null;
    this._gatewayStatus = "stopped";
    this._gatewayPort = DEFAULT_GATEWAY_PORT;
  }

  async checkInstalled() {
    try {
      const shellEnv = getShellEnv();
      for (const executable of GLOBAL_GATEWAY_BINARIES) {
        const cliPath = findExecutable(executable, shellEnv);
        if (cliPath) {
          return { installed: true, path: cliPath, mode: "global" };
        }
      }

      const fs = require("fs");
      for (const candidate of LOCAL_GATEWAY_ENTRIES) {
        if (fs.existsSync(candidate)) {
          return { installed: true, path: candidate, mode: "local" };
        }
      }

      return { installed: false, path: null, mode: null };
    } catch {
      return { installed: false, path: null, mode: null };
    }
  }

  checkNodeVersion() {
    return checkNodeVersion();
  }

  checkGitAvailable() {
    return checkGitAvailable();
  }

  getNodeDownloadUrl() {
    return getNodeDownloadUrl();
  }

  getGitDownloadUrl() {
    return getGitDownloadUrl();
  }

  _isOurProcessAlive() {
    if (!this._gatewayProcess || !this._gatewayProcess.pid) return false;
    try {
      // signal 0 checks if the process exists without sending a signal
      process.kill(this._gatewayProcess.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async checkGatewayStatus() {
    const port = this._gatewayPort || DEFAULT_GATEWAY_PORT;
    const portOpen = await isPortOpen(port);

    if (this._isOurProcessAlive() && portOpen) {
      this._gatewayStatus = "running";
    } else if (this._isOurProcessAlive() && !portOpen) {
      // Our process is alive but port not open yet (starting) or crashed
      if (this._gatewayStatus !== "starting") this._gatewayStatus = "error";
    } else if (!this._isOurProcessAlive() && portOpen) {
      // Port occupied by foreign process — we did not start it
      this._gatewayStatus = "stopped";
      this._gatewayProcess = null;
    } else {
      this._gatewayStatus = "stopped";
      this._gatewayProcess = null;
    }

    return {
      status: this._gatewayStatus,
      port,
      pid: this._gatewayProcess?.pid || null,
      portOccupied: portOpen && !this._isOurProcessAlive(),
    };
  }

  async startGateway(port = DEFAULT_GATEWAY_PORT) {
    if (this._gatewayStatus === "starting") {
      return { success: false, message: "Gateway is already starting" };
    }

    // If our process is already running on this port, report it
    if (this._isOurProcessAlive() && (await isPortOpen(port))) {
      this._gatewayStatus = "running";
      this._gatewayPort = port;
      return { success: true, message: "Gateway already running" };
    }

    // If port is occupied by a foreign process, refuse to start
    if (await isPortOpen(port)) {
      return {
        success: false,
        message: `Port ${port} is already in use by another process`,
      };
    }

    this._gatewayStatus = "starting";
    this._gatewayPort = port;

    try {
      const {
        installed,
        path: gatewayPath,
        mode,
      } = await this.checkInstalled();
      if (!installed) {
        this._gatewayStatus = "error";
        return { success: false, message: "alata-im-gateway not found" };
      }

      const shellEnv = getShellEnv();
      const configPath = getConfigPath();
      updateGatewayPort(port);
      const gatewayEnv = {
        ...shellEnv,
        OPENCLAW_CONFIG_PATH: configPath,
        GATEWAY_PORT: String(port),
      };

      let child;
      if (mode === "global") {
        child = spawnProcess(gatewayPath, ["run"], {
          env: gatewayEnv,
        });
      } else {
        const node = findExecutable("node", shellEnv) || "node";
        child = spawnProcess(node, localGatewayCommandArgs(gatewayPath), {
          env: gatewayEnv,
        });
      }

      this._gatewayProcess = child;
      child.on("exit", () => {
        if (this._gatewayStatus !== "stopped") this._gatewayStatus = "error";
        this._gatewayProcess = null;
      });

      const ready = await waitForPort(port, { maxWaitMs: 30000 });
      if (ready) {
        this._gatewayStatus = "running";
        return { success: true, message: `Gateway started on port ${port}` };
      }

      killProcess(child);
      this._gatewayStatus = "error";
      return { success: false, message: "Gateway failed to start within 30s" };
    } catch (err) {
      this._gatewayStatus = "error";
      return { success: false, message: err.message };
    }
  }

  async stopGateway() {
    if (!this._gatewayProcess) {
      this._gatewayStatus = "stopped";
      return {
        success: false,
        message: "No gateway process managed by this instance",
      };
    }

    const port = this._gatewayPort || DEFAULT_GATEWAY_PORT;
    killProcess(this._gatewayProcess);
    this._gatewayProcess = null;

    // Wait for port to close as confirmation
    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (!(await isPortOpen(port))) {
        this._gatewayStatus = "stopped";
        return { success: true, message: "Gateway stopped" };
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // Port still open after 5s — process may not have stopped cleanly
    this._gatewayStatus = "error";
    return {
      success: false,
      message: "Gateway process killed but port still occupied",
    };
  }

  async restartGateway() {
    await this.stopGateway();
    return this.startGateway(this._gatewayPort || DEFAULT_GATEWAY_PORT);
  }

  syncProviderConfig(info) {
    return syncProviderConfig(info);
  }

  getConfigSummary() {
    const config = readConfig();
    return {
      port: Number(config?.gateway?.port || DEFAULT_GATEWAY_PORT),
      provider: config?.llm?.provider || "",
      model: config?.llm?.model || "",
      apiBase: config?.llm?.apiBase || "",
      hasApiKey: Boolean(config?.llm?.apiKey),
      updatedAt: config?.llm?.updatedAt || null,
    };
  }

  getDashboardUrl() {
    return getDashboardUrl();
  }
}

const openClawService = new OpenClawService();
module.exports = { OpenClawService, openClawService };
