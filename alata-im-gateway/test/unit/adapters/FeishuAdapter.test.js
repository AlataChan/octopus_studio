const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { FeishuAdapter } = require("../../../src/adapters/FeishuAdapter");
const { resetDb } = require("../../../src/db");

describe("FeishuAdapter atomicMarkSeen", () => {
  let sandboxDir;
  let originalDataDir;

  beforeEach(() => {
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-gateway-dedup-"));
    originalDataDir = process.env.GATEWAY_DATA_DIR;
    process.env.GATEWAY_DATA_DIR = sandboxDir;
    resetDb();
  });

  afterEach(() => {
    resetDb();
    if (originalDataDir === undefined) {
      delete process.env.GATEWAY_DATA_DIR;
    } else {
      process.env.GATEWAY_DATA_DIR = originalDataDir;
    }
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });

  test("returns true for the first insert", () => {
    const adapter = new FeishuAdapter({ accountId: "cli_test", secrets: {} });

    expect(adapter.atomicMarkSeen("evt_1", "feishu", "cli_test")).toBe(true);
  });

  test("returns false for duplicate event_id", () => {
    const adapter = new FeishuAdapter({ accountId: "cli_test", secrets: {} });

    adapter.atomicMarkSeen("evt_1", "feishu", "cli_test");

    expect(adapter.atomicMarkSeen("evt_1", "feishu", "cli_test")).toBe(false);
  });

  test("returns true for a different event_id after a previous insert", () => {
    const adapter = new FeishuAdapter({ accountId: "cli_test", secrets: {} });

    adapter.atomicMarkSeen("evt_1", "feishu", "cli_test");

    expect(adapter.atomicMarkSeen("evt_2", "feishu", "cli_test")).toBe(true);
  });
});
