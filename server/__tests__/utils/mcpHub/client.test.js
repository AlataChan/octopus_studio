const http = require("http");

// NOTE: This module does not exist yet. This test is written first (TDD).
const { McpHubClient } = require("../../../utils/mcpHub/client");

describe("McpHubClient (JSON-RPC over HTTP)", () => {
  let server;
  let baseUrl;
  let lastAuthHeader = null;

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      lastAuthHeader = req.headers["authorization"] || null;

      let body = "";
      for await (const chunk of req) body += chunk.toString("utf8");
      const msg = JSON.parse(body || "{}");

      const ok = (result) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
      };

      if (msg.method === "tools/list") {
        return ok({
          tools: [
            {
              toolId: "sga_rag.search",
              toolRef: "hubref_v1:sga_rag.search",
              title: "RAG Search",
              description: "semantic search",
              category: "rag",
              riskLevel: "read",
              version: "2026-02-15",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
              },
            },
          ],
        });
      }

      if (msg.method === "tools/call") {
        return ok({
          ok: true,
          result: { echoed: msg.params || null },
        });
      }

      if (msg.method === "task.status") {
        return ok({ taskId: msg.params?.taskId, status: "completed" });
      }

      if (msg.method === "task.result") {
        return ok({ taskId: msg.params?.taskId, result: { ok: true } });
      }

      if (msg.method === "file.get") {
        return ok({
          fileId: msg.params?.fileId,
          filename: "hello.txt",
          mimeType: "text/plain",
          base64: Buffer.from("hello").toString("base64"),
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32601, message: "Method not found" },
        })
      );
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
  });

  test("calls tools/list", async () => {
    const client = new McpHubClient({ baseUrl, token: "test-token" });
    const result = await client.toolsList();
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools[0].toolId).toBe("sga_rag.search");
    expect(lastAuthHeader).toBe("Bearer test-token");
  });

  test("calls tools/call", async () => {
    const client = new McpHubClient({ baseUrl, token: "test-token" });
    const result = await client.toolsCall({
      toolRef: "hubref_v1:sga_rag.search",
      args: { query: "hello" },
      idempotencyKey: "idem-1",
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(result.result.echoed.toolRef).toBe("hubref_v1:sga_rag.search");
    expect(result.result.echoed.idempotencyKey).toBe("idem-1");
  });

  test("calls task.* and file.get", async () => {
    const client = new McpHubClient({ baseUrl, token: "test-token" });

    const status = await client.taskStatus({ taskId: "task-1" });
    expect(status.status).toBe("completed");

    const taskResult = await client.taskResult({ taskId: "task-1" });
    expect(taskResult.result.ok).toBe(true);

    const file = await client.fileGet({ fileId: "file-1" });
    expect(file.filename).toBe("hello.txt");
  });
});
