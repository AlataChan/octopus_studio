const {
  assertProductionCorsConfig,
  getCorsConfig,
  parseCorsOrigins,
} = require("../../utils/corsConfig");

describe("collector CORS config", () => {
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
});
