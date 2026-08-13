const { MoltClient } = require("../client");

describe("MoltClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  function jsonResponse(status, body) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn(async () => body),
      text: jest.fn(async () => JSON.stringify(body)),
    };
  }

  test("health returns parsed live response", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, status: "live" })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
    });

    await expect(client.health()).resolves.toEqual({
      ok: true,
      status: "live",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://molt.local/healthz",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      })
    );
  });

  test("health opens circuit after repeated 5xx failures", async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse(500, { error: "boom" }))
      .mockResolvedValueOnce(jsonResponse(502, { error: "bad gateway" }))
      .mockResolvedValueOnce(jsonResponse(503, { error: "unavailable" }));
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
      circuitCooldownMs: 60_000,
    });

    await client.health();
    await client.health();
    await client.health();
    const result = await client.health();

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: "CIRCUIT_OPEN",
      })
    );
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test("capabilitySnapshot parses capability payload", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, {
        version: "1.2.3",
        capabilities: ["agents", "matrix"],
      })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local/",
      getToken: async () => "token-1",
    });

    await expect(client.capabilitySnapshot()).resolves.toEqual({
      version: "1.2.3",
      capabilities: ["agents", "matrix"],
    });
    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/capability/snapshot"
    );
  });

  test("setupStatus calls the setup status API", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, setupComplete: true })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
    });

    await expect(client.setupStatus()).resolves.toEqual({
      ok: true,
      setupComplete: true,
    });
    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/setup/status"
    );
  });

  test("matrixStatus requests mission-control status with include_agents", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, {
        state: "initialized",
        matrixAgent: { id: "molt-matrix" },
      })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
    });

    await expect(client.matrixStatus({ includeAgents: true })).resolves.toEqual(
      {
        state: "initialized",
        matrixAgent: { id: "molt-matrix" },
      }
    );
    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/matrix/status?include_agents=true"
    );
  });

  test("matrixArchetypes calls the archetype catalog API", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, { data: [{ id: "reviewer", label: "Reviewer" }] })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
    });

    await expect(client.matrixArchetypes()).resolves.toEqual({
      data: [{ id: "reviewer", label: "Reviewer" }],
    });
    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/matrix/archetypes"
    );
  });

  test("listAgents calls the agents catalog API", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, { data: [{ id: "main", name: "Main Agent" }] })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
    });

    await expect(client.listAgents()).resolves.toEqual({
      data: [{ id: "main", name: "Main Agent" }],
    });
    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/agents"
    );
  });

  test("chatAgent posts a blocking chat request to a concrete agent", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, {
        answer: "done",
        conversation_id: "conv-1",
      })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
    });

    await expect(
      client.chatAgent("main", {
        message: "hello",
        user: { id: "u1", name: "Ada" },
        conversationId: "conv-0",
      })
    ).resolves.toEqual({ answer: "done", conversation_id: "conv-1" });

    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/agents/main/chat"
    );
    expect(global.fetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          message: "hello",
          user: { id: "u1", name: "Ada" },
          response_mode: "blocking",
          conversation_id: "conv-0",
        }),
      })
    );
  });

  test("createMatrixAgent posts an archetype payload to Mission Control", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(201, { id: "agent-1", archetype: "pm" })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
    });

    await expect(
      client.createMatrixAgent({ archetype: "pm", name: "Project Lead" })
    ).resolves.toEqual({ id: "agent-1", archetype: "pm" });
    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/matrix/agents"
    );
    expect(global.fetch.mock.calls[0][1].method).toBe("POST");
  });

  test("matrixInit posts to Matrix init with an explicit admin token", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, initialized: true })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "main-token",
    });

    await expect(
      client.matrixInit({ adminToken: "admin-token" })
    ).resolves.toEqual({
      ok: true,
      initialized: true,
    });

    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/matrix/init"
    );
    expect(global.fetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer admin-token",
        }),
      })
    );
  });

  test("matrixInit falls back to default token when no admin token is provided", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, initialized: true })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "main-token",
    });

    await client.matrixInit();

    expect(global.fetch.mock.calls[0][1].headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer main-token",
      })
    );
  });

  test("uploadAgentFile posts base64 file content to a concrete agent", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(201, {
        data: { upload_id: "upload-1", filename: "notes.md" },
      })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
    });

    await expect(
      client.uploadAgentFile("main", {
        filename: "notes.md",
        dataBase64: "SGVsbG8=",
      })
    ).resolves.toEqual({
      data: { upload_id: "upload-1", filename: "notes.md" },
    });
    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/agents/main/files"
    );
    expect(global.fetch.mock.calls[0][1].body).toBe(
      JSON.stringify({ filename: "notes.md", data_base64: "SGVsbG8=" })
    );
  });

  test("listAgentConversations scopes conversation listing by user", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, { data: [{ id: "conv-1" }] })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => "token-1",
    });

    await expect(
      client.listAgentConversations("main", {
        userId: "user-1",
        limit: 10,
        offset: 5,
      })
    ).resolves.toEqual({ data: [{ id: "conv-1" }] });
    expect(global.fetch.mock.calls[0][0]).toBe(
      "http://molt.local/api/v1/agents/main/conversations?user_id=user-1&limit=10&offset=5"
    );
  });

  test("omits Authorization header when getToken returns null", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, status: "live" })
    );
    const client = new MoltClient({
      baseUrl: "http://molt.local",
      getToken: async () => null,
    });

    await client.health();

    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });
});
