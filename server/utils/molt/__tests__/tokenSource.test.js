const fs = require("fs");
const os = require("os");
const path = require("path");
const { readMoltToken } = require("../tokenSource");

describe("readMoltToken", () => {
  const originalEnv = { ...process.env };
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "molt-token-"));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test("prefers non-empty token file over env", async () => {
    const tokenPath = path.join(tempDir, "gateway.token");
    fs.writeFileSync(tokenPath, " file-token\n", "utf8");
    process.env.MOLT_API_TOKEN = "env-token";

    await expect(
      readMoltToken({ filePath: tokenPath, envName: "MOLT_API_TOKEN" })
    ).resolves.toBe("file-token");
  });

  test("falls back to env when token file is missing", async () => {
    process.env.MOLT_API_TOKEN = "env-token";

    await expect(
      readMoltToken({
        filePath: path.join(tempDir, "missing.token"),
        envName: "MOLT_API_TOKEN",
      })
    ).resolves.toBe("env-token");
  });

  test("returns null when file and env are empty", async () => {
    delete process.env.MOLT_API_TOKEN;

    await expect(
      readMoltToken({
        filePath: path.join(tempDir, "missing.token"),
        envName: "MOLT_API_TOKEN",
      })
    ).resolves.toBeNull();
  });

  test("warns and falls back when token file cannot be read", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    process.env.MOLT_API_TOKEN = "env-token";

    await expect(
      readMoltToken({ filePath: tempDir, envName: "MOLT_API_TOKEN" })
    ).resolves.toBe("env-token");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[MoltToken] Unable to read token file"),
      expect.any(String)
    );
  });
});
