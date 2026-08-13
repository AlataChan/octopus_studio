/**
 * OpenClaw 后端单元测试
 *
 * processHelper: 直接测试端口检查逻辑
 * configHelper: 使用 jest.isolateModules + 环境变量 覆盖 homedir
 */
const os = require("os");
const path = require("path");
const fs = require("fs");

const {
  isPortOpen,
  waitForPort,
} = require("../../utils/openClaw/processHelper");

describe("processHelper", () => {
  it("isPortOpen returns a boolean for a closed port", async () => {
    const result = await isPortOpen(19997);
    expect(typeof result).toBe("boolean");
  });

  it("waitForPort resolves false when port never opens within timeout", async () => {
    const result = await waitForPort(19996, {
      maxWaitMs: 300,
      intervalMs: 100,
    });
    expect(result).toBe(false);
  });
});

describe("configHelper (isolated to respect mocked homedir)", () => {
  // Use mock-prefixed variable to satisfy Jest's out-of-scope restriction
  let mockHomeDir;

  beforeEach(() => {
    mockHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-test-"));
  });

  afterEach(() => {
    fs.rmSync(mockHomeDir, { recursive: true, force: true });
    jest.resetModules();
  });

  function loadConfigHelper() {
    let helper;
    jest.isolateModules(() => {
      jest.mock("os", () => ({
        ...jest.requireActual("os"),
        homedir: () => mockHomeDir,
        platform: jest.requireActual("os").platform,
      }));
      helper = require("../../utils/openClaw/configHelper");
    });
    return helper;
  }

  it("syncProviderConfig writes config and returns authToken", () => {
    const { syncProviderConfig, readConfig } = loadConfigHelper();

    const result = syncProviderConfig({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-test",
    });

    expect(result.authToken).toBeTruthy();
    expect(result.authToken).toHaveLength(64);
    expect(result.port).toBe(18790);

    const config = readConfig();
    expect(config.llm.provider).toBe("openai");
    expect(config.llm.model).toBe("gpt-4o");
  });

  it("getDashboardUrl includes port and token", () => {
    const { syncProviderConfig, getDashboardUrl } = loadConfigHelper();

    syncProviderConfig({ provider: "openai", model: "gpt-4o" });
    const url = getDashboardUrl();

    expect(url).toMatch(/^http:\/\/localhost:18790/);
    expect(url).toContain("token=");
  });

  it("re-uses existing authToken on subsequent syncs", () => {
    const helper = loadConfigHelper();
    const first = helper.syncProviderConfig({
      provider: "openai",
      model: "gpt-4o",
    });
    const second = helper.syncProviderConfig({
      provider: "deepseek",
      model: "deepseek-chat",
    });
    expect(first.authToken).toBe(second.authToken);
  });
});

describe("OpenClawService", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("detects the globally installed alata-gateway binary", async () => {
    let OpenClawService;
    const findExecutable = jest.fn((name) =>
      name === "alata-gateway" ? "/usr/local/bin/alata-gateway" : null
    );

    jest.isolateModules(() => {
      jest.doMock("../../utils/openClaw/envHelper", () => ({
        getShellEnv: () => ({ PATH: "/usr/local/bin" }),
        findExecutable,
        checkNodeVersion: jest.fn(),
        checkGitAvailable: jest.fn(),
        getNodeDownloadUrl: jest.fn(),
        getGitDownloadUrl: jest.fn(),
      }));
      OpenClawService = require("../../utils/openClaw").OpenClawService;
    });

    const service = new OpenClawService();
    const result = await service.checkInstalled();

    expect(findExecutable).toHaveBeenCalledWith(
      "alata-gateway",
      expect.any(Object)
    );
    expect(result).toEqual({
      installed: true,
      path: "/usr/local/bin/alata-gateway",
      mode: "global",
    });
  });

  it("starts the local gateway via the CLI run command and syncs the chosen port", async () => {
    let OpenClawService;
    const mockSpawnProcess = jest.fn(() => ({
      on: jest.fn(),
      pid: 12345,
    }));
    const mockUpdateGatewayPort = jest.fn();

    jest.isolateModules(() => {
      jest.doMock("../../utils/openClaw/envHelper", () => ({
        getShellEnv: () => ({ PATH: "/usr/bin" }),
        findExecutable: jest.fn((name) =>
          name === "node" ? "/usr/bin/node" : null
        ),
        checkNodeVersion: jest.fn(),
        checkGitAvailable: jest.fn(),
        getNodeDownloadUrl: jest.fn(),
        getGitDownloadUrl: jest.fn(),
      }));
      jest.doMock("../../utils/openClaw/processHelper", () => ({
        isPortOpen: jest.fn().mockResolvedValue(false),
        waitForPort: jest.fn().mockResolvedValue(true),
        spawnProcess: mockSpawnProcess,
        killProcess: jest.fn(),
      }));
      jest.doMock("../../utils/openClaw/configHelper", () => ({
        DEFAULT_GATEWAY_PORT: 18790,
        getConfigPath: () => "/tmp/openclaw.alata.json",
        syncProviderConfig: jest.fn(),
        getDashboardUrl: jest.fn(),
        readConfig: jest.fn(() => ({})),
        updateGatewayPort: mockUpdateGatewayPort,
      }));
      OpenClawService = require("../../utils/openClaw").OpenClawService;
    });

    const service = new OpenClawService();
    service.checkInstalled = jest.fn().mockResolvedValue({
      installed: true,
      path: "/repo/alata-im-gateway/bin/alata-gateway.js",
      mode: "local",
    });

    const result = await service.startGateway(18888);

    expect(mockUpdateGatewayPort).toHaveBeenCalledWith(18888);
    expect(mockSpawnProcess).toHaveBeenCalledWith(
      "/usr/bin/node",
      ["/repo/alata-im-gateway/bin/alata-gateway.js", "run"],
      {
        env: expect.objectContaining({
          OPENCLAW_CONFIG_PATH: "/tmp/openclaw.alata.json",
          GATEWAY_PORT: "18888",
        }),
      }
    );
    expect(result).toEqual({
      success: true,
      message: "Gateway started on port 18888",
    });
  });
});
