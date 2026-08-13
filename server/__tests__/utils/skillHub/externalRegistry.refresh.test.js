const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { ExternalRegistry } = require("../../../utils/plugins/skillHub/registry/externalRegistry");

describe("ExternalRegistry.refresh (remote index)", () => {
  let server;
  let baseUrl;
  let tempDir;

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      if (req.url === "/index.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            skills: [
              {
                skillId: "github:test-invoice-skill",
                name: "test-invoice-skill",
                description: "Handles invoice PDFs",
                tags: ["invoice"],
                sourceType: "github",
                verified: true,
              },
            ],
          })
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-external-"));
    process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("refresh() fetches registries and updates index", async () => {
    const registry = new ExternalRegistry({
      bundledIndex: [],
      cacheDir: tempDir,
      registries: [{ name: "test", url: `${baseUrl}/index.json`, priority: 1 }],
    });

    await registry.loadIndex();
    const count = await registry.refresh();
    expect(count).toBe(1);

    const results = await registry.search("invoice", { topN: 5 });
    expect(results[0].skillId).toBe("github:test-invoice-skill");
  });
});

