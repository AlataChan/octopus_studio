const cors = require("cors");
const express = require("express");
const request = require("supertest");
const {
  assertProductionCorsConfig,
  getCorsConfig,
  getPublicEmbedCorsConfig,
  parseCorsOrigins,
} = require("../../utils/corsConfig");

describe("server CORS config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("preserves permissive defaults outside desktop runtime", () => {
    process.env.NODE_ENV = "development";
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.ANYTHING_LLM_RUNTIME;
    delete process.env.CORS_CREDENTIALS;

    expect(() => assertProductionCorsConfig()).not.toThrow();
    expect(parseCorsOrigins()).toBe(true);
    expect(getCorsConfig()).toMatchObject({
      origin: true,
      credentials: true,
    });
  });

  test("does not allow all origins by default in desktop runtime", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.CORS_CREDENTIALS;
    process.env.ANYTHING_LLM_RUNTIME = "desktop";

    expect(() => assertProductionCorsConfig()).not.toThrow();
    expect(parseCorsOrigins()).toBe(false);
    expect(getCorsConfig()).toMatchObject({
      origin: false,
      credentials: false,
    });
  });

  test("does not fall back to all origins for malformed desktop origins", () => {
    process.env.NODE_ENV = "production";
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    process.env.CORS_ALLOWED_ORIGINS = ",";
    delete process.env.CORS_CREDENTIALS;

    expect(() => assertProductionCorsConfig()).not.toThrow();
    expect(parseCorsOrigins()).toBe(false);
    expect(getCorsConfig()).toMatchObject({
      origin: false,
      credentials: false,
    });
  });

  test("allows explicit desktop app origin with credentials", () => {
    process.env.NODE_ENV = "production";
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    process.env.CORS_ALLOWED_ORIGINS = "http://127.0.0.1:3001";
    delete process.env.CORS_CREDENTIALS;

    expect(getCorsConfig()).toMatchObject({
      origin: "http://127.0.0.1:3001",
      credentials: true,
    });
  });

  test("does not pair desktop wildcard origin with credentials", () => {
    process.env.NODE_ENV = "production";
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    process.env.CORS_ALLOWED_ORIGINS = "*";
    delete process.env.CORS_CREDENTIALS;

    expect(getCorsConfig()).toMatchObject({
      origin: true,
      credentials: false,
    });
  });

  test("requires explicit origins in production outside desktop runtime", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.ANYTHING_LLM_RUNTIME;

    expect(() => assertProductionCorsConfig()).toThrow(
      /CORS_ALLOWED_ORIGINS is required in production/
    );
  });

  test("allows deliberate wildcard origins in production", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "*";
    delete process.env.ANYTHING_LLM_RUNTIME;

    expect(() => assertProductionCorsConfig()).not.toThrow();
    expect(getCorsConfig()).toMatchObject({
      origin: true,
      credentials: true,
    });
  });

  test("allows explicit origin list in production", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS =
      "https://app.example.com, https://admin.example.com";
    delete process.env.ANYTHING_LLM_RUNTIME;

    expect(() => assertProductionCorsConfig()).not.toThrow();
    expect(getCorsConfig()).toMatchObject({
      origin: ["https://app.example.com", "https://admin.example.com"],
      credentials: true,
    });
  });

  test("public embed CORS remains open for customer domains", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    delete process.env.ANYTHING_LLM_RUNTIME;

    expect(getPublicEmbedCorsConfig()).toMatchObject({
      origin: true,
      credentials: false,
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    });
  });

  test("route-level embed CORS stays public without opening admin routes", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    delete process.env.ANYTHING_LLM_RUNTIME;

    const app = express();
    assertProductionCorsConfig();
    app.use(cors({ ...getCorsConfig(), preflightContinue: true }));
    const publicEmbedCors = cors(getPublicEmbedCorsConfig());
    const reservedEmbedSegments = new Set(["chats", "new", "update"]);
    const publicEmbedCorsRoute = (req, res, next) => {
      const embedId = String(req.params?.embedId || "").toLowerCase();
      if (reservedEmbedSegments.has(embedId)) return next("route");
      return publicEmbedCors(req, res, () => {
        res.removeHeader("Access-Control-Allow-Credentials");
        next();
      });
    };
    const sendPreflight = (_req, res) => res.sendStatus(204);

    app.post("/api/embed/update/:embedId", (_req, res) =>
      res.json({ success: true })
    );
    app.delete("/api/embed/chats/:chatId", (_req, res) =>
      res.json({ success: true })
    );
    app.options("/api/embed/:embedId/stream-chat", [
      publicEmbedCorsRoute,
      sendPreflight,
    ]);
    app.options("/api/embed/:embedId/:sessionId", [
      publicEmbedCorsRoute,
      sendPreflight,
    ]);
    app.post(
      "/api/embed/:embedId/stream-chat",
      [publicEmbedCorsRoute],
      (_req, res) => res.json({ success: true })
    );
    app.get(
      "/api/embed/:embedId/:sessionId",
      [publicEmbedCorsRoute],
      (_req, res) => res.json({ success: true })
    );
    app.get("/api/private", (_req, res) => res.json({ success: true }));
    app.options("*", (_req, res) => res.sendStatus(204));

    const embedPreflight = await request(app)
      .options("/api/embed/embed-uuid/stream-chat")
      .set("Origin", "https://customer.example");
    expect(embedPreflight.headers["access-control-allow-origin"]).toBe(
      "https://customer.example"
    );
    expect(
      embedPreflight.headers["access-control-allow-credentials"]
    ).toBeUndefined();

    const embedResponse = await request(app)
      .get("/api/embed/embed-uuid/session-uuid")
      .set("Origin", "https://customer.example");
    expect(embedResponse.headers["access-control-allow-origin"]).toBe(
      "https://customer.example"
    );
    expect(
      embedResponse.headers["access-control-allow-credentials"]
    ).toBeUndefined();

    const normalPreflight = await request(app)
      .options("/api/private")
      .set("Origin", "https://customer.example");
    expect(normalPreflight.headers["access-control-allow-origin"]).not.toBe(
      "https://customer.example"
    );
    expect(normalPreflight.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com"
    );

    const adminResponse = await request(app)
      .post("/api/embed/update/123")
      .set("Origin", "https://customer.example");
    expect(adminResponse.headers["access-control-allow-origin"]).not.toBe(
      "https://customer.example"
    );
    expect(adminResponse.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com"
    );

    const reservedAdminPreflight = await request(app)
      .options("/api/embed/chats/123")
      .set("Origin", "https://customer.example");
    expect(
      reservedAdminPreflight.headers["access-control-allow-origin"]
    ).not.toBe("https://customer.example");
    expect(reservedAdminPreflight.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com"
    );

    const updateAdminPreflight = await request(app)
      .options("/api/embed/update/123")
      .set("Origin", "https://customer.example");
    expect(
      updateAdminPreflight.headers["access-control-allow-origin"]
    ).not.toBe("https://customer.example");
    expect(updateAdminPreflight.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com"
    );
  });

  test("production OPTIONS fallback runs before SPA catch-all", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    delete process.env.ANYTHING_LLM_RUNTIME;

    const app = express();
    assertProductionCorsConfig();
    app.use(cors({ ...getCorsConfig(), preflightContinue: true }));
    app.get("/api/private", (_req, res) => res.json({ success: true }));
    app.options("*", (_req, res) => res.sendStatus(204));
    app.use("/", (_req, res) => res.type("html").send("<html>index</html>"));

    const response = await request(app)
      .options("/api/unknown-non-embed")
      .set("Origin", "https://customer.example");

    expect(response.status).toBe(204);
    expect(response.headers["content-type"] || "").not.toMatch(/text\/html/);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com"
    );
  });
});
