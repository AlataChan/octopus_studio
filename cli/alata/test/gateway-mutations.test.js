const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { spawn } = require("node:child_process");
const path = require("node:path");

function runCli(args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "..", "bin", "alata.js"), ...args],
      {
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, ...extraEnv },
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function withApiServer(handler, callback) {
  const server = http.createServer(async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ success: false, error: error.message }));
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

test("gateway account upsert sends JSON body and prints json result", async () => {
  await withApiServer(async (request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/im-gateway/accounts/upsert");

    const body = await readJson(request);
    assert.deepEqual(body, {
      provider: "wecom",
      accountId: "corp-main",
      status: "active",
      secrets: { corpId: "wx-1" },
      tokenExpiresAt: null,
    });

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        success: true,
        account: {
          provider: "wecom",
          accountId: "corp-main",
          status: "active",
        },
      })
    );
  }, async (baseUrl) => {
    const result = await runCli(
      [
        "gateway",
        "account",
        "upsert",
        "--provider",
        "wecom",
        "--account-id",
        "corp-main",
        "--secrets",
        '{"corpId":"wx-1"}',
        "--output",
        "json",
      ],
      {
        ALATA_API_BASE: baseUrl,
        ALATA_API_TOKEN: "test-token",
      }
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      account: {
        provider: "wecom",
        accountId: "corp-main",
        status: "active",
      },
    });
  });
});

test("gateway binding apply sends JSON body and prints json result", async () => {
  await withApiServer(async (request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/im-gateway/bindings/upsert");

    const body = await readJson(request);
    assert.deepEqual(body, {
      id: null,
      provider: "wecom",
      accountId: "corp-main",
      workspaceId: 42,
      match: { keywords: ["deploy"] },
      route: { workspaceSlug: "ops" },
      security: { requireApproval: true },
      priority: 3,
      enabled: true,
    });

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        success: true,
        binding: {
          id: 9,
          provider: "wecom",
          workspaceId: 42,
          enabled: true,
        },
      })
    );
  }, async (baseUrl) => {
    const result = await runCli(
      [
        "gateway",
        "binding",
        "apply",
        "--provider",
        "wecom",
        "--account-id",
        "corp-main",
        "--workspace-id",
        "42",
        "--match",
        '{"keywords":["deploy"]}',
        "--route",
        '{"workspaceSlug":"ops"}',
        "--security",
        '{"requireApproval":true}',
        "--priority",
        "3",
        "--enabled",
        "true",
        "--output",
        "json",
      ],
      {
        ALATA_API_BASE: baseUrl,
        ALATA_API_TOKEN: "test-token",
      }
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      binding: {
        id: 9,
        provider: "wecom",
        workspaceId: 42,
        enabled: true,
      },
    });
  });
});

test("gateway runtime rotate-token prints bootstrap token payload", async () => {
  await withApiServer(async (request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/im-gateway/runtimes/rt-edge-1/rotate-token");

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        success: true,
        runtime: { id: "rt-edge-1", status: "registered" },
        bootstrapToken: "bootstrap-rotated",
      })
    );
  }, async (baseUrl) => {
    const result = await runCli(
      [
        "gateway",
        "runtime",
        "rotate-token",
        "--id",
        "rt-edge-1",
        "--output",
        "json",
      ],
      {
        ALATA_API_BASE: baseUrl,
        ALATA_API_TOKEN: "test-token",
      }
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      rotation: {
        runtime: { id: "rt-edge-1", status: "registered" },
        bootstrapToken: "bootstrap-rotated",
      },
    });
  });
});

test("approvals list requests workspace-scoped endpoint", async () => {
  await withApiServer(async (request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/workspace/ops/confirmations/pending");

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        success: true,
        confirmations: [{ id: 77, status: "pending", title: "Deploy plan" }],
      })
    );
  }, async (baseUrl) => {
    const result = await runCli(
      ["approvals", "list", "--workspace", "ops", "--output", "json"],
      {
        ALATA_API_BASE: baseUrl,
        ALATA_API_TOKEN: "test-token",
      }
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      confirmations: [{ id: 77, status: "pending", title: "Deploy plan" }],
    });
  });
});

test("cli exits non-zero on API failures", async () => {
  await withApiServer(async (_request, response) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ success: false, error: "gateway exploded" }));
  }, async (baseUrl) => {
    const result = await runCli(["gateway", "runtime", "list", "--output", "json"], {
      ALATA_API_BASE: baseUrl,
      ALATA_API_TOKEN: "test-token",
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /gateway exploded/);
  });
});
