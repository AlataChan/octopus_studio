const {
  createFdeClient,
  FdeServiceError,
} = require("../../../utils/fde/fdeClient");

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("FDE service client", () => {
  it("logs in with configured credentials and keeps the session cookie server-side", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          { ok: true },
          {
            "set-cookie":
              "fde_session=secret-cookie; Path=/v1; HttpOnly; Secure",
          }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { session_id: "fde-session", state: "init" })
      );
    const client = createFdeClient({
      baseUrl: "https://fde.example.test",
      username: "service-user",
      password: "service-password",
      fetchImpl,
    });

    await expect(client.createSession()).resolves.toEqual({
      session_id: "fde-session",
      state: "init",
    });

    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://fde.example.test/v1/auth/login"
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      username: "service-user",
      password: "service-password",
    });
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({
      Cookie: "fde_session=secret-cookie",
      Origin: "https://fde.example.test",
    });
  });

  it("re-authenticates once on 401 and never exposes the upstream message", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          { ok: true },
          { "set-cookie": "fde_session=one; Path=/v1" }
        )
      )
      .mockResolvedValueOnce(jsonResponse(401, { detail: "leak this detail" }))
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          { ok: true },
          { "set-cookie": "fde_session=two; Path=/v1" }
        )
      )
      .mockResolvedValueOnce(jsonResponse(503, { detail: "still secret" }));
    const client = createFdeClient({
      baseUrl: "https://fde.example.test",
      username: "user",
      password: "password",
      fetchImpl,
    });

    let error;
    try {
      await client.createTurn("session-a", "describe it");
    } catch (caught) {
      error = caught;
    }
    expect(error).toEqual(
      expect.objectContaining({
        code: "FDE_SERVICE_UPSTREAM_ERROR",
        status: 502,
      })
    );
    expect(error.message).not.toMatch(/secret|detail/i);
  });

  it("retries idempotent GETs at most twice but never retries a failed mutation", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true }, { "set-cookie": "fde_session=one" })
      )
      .mockRejectedValueOnce(new Error("socket secret"))
      .mockResolvedValueOnce(jsonResponse(200, { ir: { ir_version: "0.3" } }));
    const client = createFdeClient({
      baseUrl: "http://127.0.0.1:8787",
      username: "user",
      password: "password",
      fetchImpl,
      sleep: async () => {},
    });

    await expect(client.getIr("session-a")).resolves.toMatchObject({
      ir: { ir_version: "0.3" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    fetchImpl.mockRejectedValueOnce(new Error("socket secret"));
    await expect(client.compile("session-a")).rejects.toBeInstanceOf(
      FdeServiceError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("rejects non-loopback HTTP and missing discovery configuration", () => {
    expect(() =>
      createFdeClient({
        baseUrl: "http://fde.example.test",
        username: "user",
        password: "password",
      })
    ).toThrow(expect.objectContaining({ code: "FDE_SERVICE_TLS_REQUIRED" }));
    expect(() => createFdeClient({ baseUrl: "" })).toThrow(
      expect.objectContaining({ code: "FDE_SERVICE_NOT_CONFIGURED" })
    );
  });

  it("downloads artifact bytes without parsing them as JSON", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true }, { "set-cookie": "fde_session=one" })
      )
      .mockResolvedValueOnce(
        new Response('{"target":"studio"}', { status: 200 })
      );
    const client = createFdeClient({
      baseUrl: "https://fde.example.test",
      username: "user",
      password: "password",
      fetchImpl,
    });

    await expect(
      client.downloadArtifact("session-a", "artifact-a")
    ).resolves.toBe('{"target":"studio"}');
  });
});
