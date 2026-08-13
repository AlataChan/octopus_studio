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

async function withApiServer(routes, callback) {
  const server = http.createServer((request, response) => {
    const handler = routes[`${request.method} ${request.url}`];
    if (!handler) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "not found" }));
      return;
    }
    handler(request, response);
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

test("gateway runtime list prints machine-readable output", async () => {
  await withApiServer(
    {
      "GET /im-gateway/runtimes": (_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            success: true,
            runtimes: [{ id: "rt-1", name: "Managed Gateway", mode: "sidecar" }],
          })
        );
      },
    },
    async (baseUrl) => {
      const result = await runCli(["gateway", "runtime", "list", "--output", "json"], {
        ALATA_API_BASE: baseUrl,
        ALATA_API_TOKEN: "test-token",
      });

      assert.equal(result.exitCode, 0);
      assert.deepEqual(JSON.parse(result.stdout), {
        runtimes: [{ id: "rt-1", name: "Managed Gateway", mode: "sidecar" }],
      });
    }
  );
});

test("gateway account list prints json output", async () => {
  await withApiServer(
    {
      "GET /im-gateway/accounts": (_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            success: true,
            accounts: [{ provider: "wecom", accountId: "corp-main", status: "active" }],
          })
        );
      },
    },
    async (baseUrl) => {
      const result = await runCli(["gateway", "account", "list", "--output", "json"], {
        ALATA_API_BASE: baseUrl,
        ALATA_API_TOKEN: "test-token",
      });

      assert.equal(result.exitCode, 0);
      assert.deepEqual(JSON.parse(result.stdout), {
        accounts: [{ provider: "wecom", accountId: "corp-main", status: "active" }],
      });
    }
  );
});

test("gateway binding list prints json output", async () => {
  await withApiServer(
    {
      "GET /im-gateway/bindings": (_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            success: true,
            bindings: [{ id: 11, provider: "wecom", workspaceId: 7, enabled: true }],
          })
        );
      },
    },
    async (baseUrl) => {
      const result = await runCli(["gateway", "binding", "list", "--output", "json"], {
        ALATA_API_BASE: baseUrl,
        ALATA_API_TOKEN: "test-token",
      });

      assert.equal(result.exitCode, 0);
      assert.deepEqual(JSON.parse(result.stdout), {
        bindings: [{ id: 11, provider: "wecom", workspaceId: 7, enabled: true }],
      });
    }
  );
});
