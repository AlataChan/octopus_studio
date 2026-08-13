const { EventEmitter } = require("events");
const path = require("path");

function fakeChild({ stdout = "", stderr = "", code = 0, delayMs = 0 } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn(() => {
    child.emit("close", null, "SIGTERM");
    return true;
  });

  process.nextTick(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    setTimeout(() => child.emit("close", code, null), delayMs);
  });

  return child;
}

describe("KbClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("spawns the JSON CLI with an explicit environment allowlist", async () => {
    process.env.JWT_SECRET = "must-not-leak";
    process.env.OPEN_AI_KEY = "must-not-leak";
    process.env.PATH = "/usr/bin";
    const spawnFn = jest.fn(() =>
      fakeChild({
        stdout: JSON.stringify({ nodes: [{ id: "n1" }], edges: [] }),
      })
    );
    const { KbClient } = require("../../utils/octopusKb/KbClient");
    const client = new KbClient({
      command: "/usr/bin/python3",
      args: ["-I"],
      vaultRoot: "/tmp/kb-vaults",
      spawnFn,
    });

    await expect(client.exportGraph("workspace-a")).resolves.toEqual({
      nodes: [{ id: "n1" }],
      edges: [],
    });

    expect(spawnFn).toHaveBeenCalledWith(
      "/usr/bin/python3",
      [
        "-I",
        "-m",
        "octopus_kb_mcp.cli",
        "export-graph",
        "--vault",
        path.join("/tmp/kb-vaults", "workspace-a"),
      ],
      expect.objectContaining({
        shell: false,
        env: expect.objectContaining({
          PATH: "/usr/bin",
          PYTHONPATH: expect.stringContaining(
            path.join("server", "integrations", "octopus-kb", "src")
          ),
          OCTOPUS_KB_VAULT_ROOT: "/tmp/kb-vaults",
        }),
      })
    );
    const options = spawnFn.mock.calls[0][2];
    expect(options.env.JWT_SECRET).toBeUndefined();
    expect(options.env.OPEN_AI_KEY).toBeUndefined();
  });

  it("returns null for non-zero exits instead of throwing", async () => {
    const spawnFn = jest.fn(() => fakeChild({ stderr: "bad", code: 2 }));
    const { KbClient } = require("../../utils/octopusKb/KbClient");
    const client = new KbClient({
      command: "/usr/bin/python3",
      vaultRoot: "/tmp/kb-vaults",
      spawnFn,
    });

    await expect(client.exportGraph("workspace-a")).resolves.toBeNull();
  });

  it("times out and returns null", async () => {
    const spawnFn = jest.fn(() => fakeChild({ stdout: "{}", delayMs: 100 }));
    const { KbClient } = require("../../utils/octopusKb/KbClient");
    const client = new KbClient({
      command: "/usr/bin/python3",
      vaultRoot: "/tmp/kb-vaults",
      timeoutMs: 10,
      spawnFn,
    });

    await expect(client.exportGraph("workspace-a")).resolves.toBeNull();
    expect(spawnFn.mock.results[0].value.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("is disabled by default when no DB or env setting enables it", async () => {
    const { KbClient } = require("../../utils/octopusKb/KbClient");
    const client = new KbClient({
      command: "/usr/bin/python3",
      vaultRoot: "/tmp/kb-vaults",
      SystemSettingsModel: {
        get: jest.fn(async () => null),
      },
    });

    await expect(client.enabled()).resolves.toBe(false);
  });

  it("injects LLM profile only for propose and validate calls", async () => {
    const spawnFn = jest.fn(() => fakeChild({ stdout: JSON.stringify({ ok: true }) }));
    const { KbClient } = require("../../utils/octopusKb/KbClient");
    const client = new KbClient({
      command: "/usr/bin/python3",
      vaultRoot: "/tmp/kb-vaults",
      spawnFn,
    });

    await client.propose("workspace-a", "raw/hi.md", {
      baseURL: "https://api.example/v1",
      apiKey: "secret",
      model: "model-a",
    });

    const env = spawnFn.mock.calls[0][2].env;
    expect(env.KB_LLM_BASE_URL).toBe("https://api.example/v1");
    expect(env.KB_LLM_API_KEY).toBe("secret");
    expect(env.KB_LLM_MODEL).toBe("model-a");
  });

  it("spawns write-page with a JSON page payload", async () => {
    const spawnFn = jest.fn(() =>
      fakeChild({ stdout: JSON.stringify({ path: "wiki/memory/thread.md" }) })
    );
    const { KbClient } = require("../../utils/octopusKb/KbClient");
    const client = new KbClient({
      command: "/usr/bin/python3",
      args: ["-I"],
      vaultRoot: "/tmp/kb-vaults",
      spawnFn,
    });
    const page = {
      path: "wiki/memory/thread.md",
      type: "note",
      role: "note",
      layer: "wiki",
      frontmatter: {
        title: "Thread Memory",
        lang: "en",
        kind: "summary",
        summary: "Thread summary",
      },
      body: "Thread body.",
    };

    await expect(client.writePage("workspace-a", page)).resolves.toEqual({
      path: "wiki/memory/thread.md",
    });

    expect(spawnFn).toHaveBeenCalledWith(
      "/usr/bin/python3",
      [
        "-I",
        "-m",
        "octopus_kb_mcp.cli",
        "write-page",
        "--vault",
        path.join("/tmp/kb-vaults", "workspace-a"),
        "--page-json",
        JSON.stringify(page),
      ],
      expect.objectContaining({ shell: false })
    );
  });

  it("builds an OpenAI-compatible LLM profile without persisting credentials", async () => {
    process.env.LLM_PROVIDER = "generic-openai";
    process.env.GENERIC_OPEN_AI_BASE_PATH = "https://api.deepseek.com";
    process.env.GENERIC_OPEN_AI_API_KEY = "sk-profile";
    process.env.GENERIC_OPEN_AI_MODEL_PREF = "deepseek-v4-pro";
    const spawnFn = jest.fn(() => fakeChild({ stdout: JSON.stringify({ ok: true }) }));
    const { KbClient, buildLlmProfile } = require("../../utils/octopusKb/KbClient");

    const profile = await buildLlmProfile();
    expect(profile).toEqual({
      baseURL: "https://api.deepseek.com",
      apiKey: "sk-profile",
      model: "deepseek-v4-pro",
      provider: "generic-openai",
    });

    const client = new KbClient({
      command: "/usr/bin/python3",
      vaultRoot: "/tmp/kb-vaults",
      spawnFn,
    });

    await client.exportGraph("workspace-a");
    await client.validate("workspace-a", "proposals/demo.json", {
      apply: true,
      profile,
    });

    expect(spawnFn.mock.calls[0][2].env.KB_LLM_API_KEY).toBeUndefined();
    expect(spawnFn.mock.calls[1][2].env.KB_LLM_API_KEY).toBe("sk-profile");
  });
});
