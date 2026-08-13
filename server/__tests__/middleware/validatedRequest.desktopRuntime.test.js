const mockIsMultiUserMode = jest.fn();

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    isMultiUserMode: (...args) => mockIsMultiUserMode(...args),
  },
}));

const { validatedRequest } = require("../../utils/middleware/validatedRequest");

function buildRequest({
  method = "GET",
  headers = {},
  protocol = "http",
} = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    method,
    protocol,
    header: jest.fn(
      (name) => normalizedHeaders[String(name).toLowerCase()] || null
    ),
  };
}

function buildResponse() {
  const response = {
    locals: {},
    status: jest.fn(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function (body) {
      this.body = body;
      return this;
    }),
  };

  return response;
}

describe("validatedRequest desktop runtime auth policy", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMultiUserMode.mockResolvedValue(false);

    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "desktop-runtime-test-secret";
    delete process.env.AUTH_TOKEN;
    delete process.env.ANYTHING_LLM_RUNTIME;
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("rejects non-desktop production single-user requests when AUTH_TOKEN is missing", async () => {
    const request = buildRequest();
    const response = buildResponse();
    const next = jest.fn();

    await validatedRequest(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error:
        "Authentication required: set AUTH_TOKEN to enable single-user password mode (or enable multi-user mode).",
    });
  });

  test("keeps non-desktop auth behavior unchanged for cross-origin unsafe requests", async () => {
    const request = buildRequest({
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Sec-Fetch-Site": "cross-site",
        Host: "127.0.0.1:3001",
      },
    });
    const response = buildResponse();
    const next = jest.fn();

    await validatedRequest(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error:
        "Authentication required: set AUTH_TOKEN to enable single-user password mode (or enable multi-user mode).",
    });
  });

  test("rejects non-desktop production single-user requests when JWT_SECRET and AUTH_TOKEN are missing", async () => {
    delete process.env.JWT_SECRET;
    const request = buildRequest();
    const response = buildResponse();
    const next = jest.fn();

    await validatedRequest(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error:
        "Server misconfigured: JWT_SECRET is unset. Set JWT_SECRET (and AUTH_TOKEN for single-user mode) before running in production.",
    });
  });

  test("allows desktop production single-user requests when AUTH_TOKEN is missing", async () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    const request = buildRequest();
    const response = buildResponse();
    const next = jest.fn();

    await validatedRequest(request, response, next);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("allows desktop production single-user requests when JWT_SECRET and AUTH_TOKEN are missing", async () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    delete process.env.JWT_SECRET;
    const request = buildRequest();
    const response = buildResponse();
    const next = jest.fn();

    await validatedRequest(request, response, next);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("rejects desktop no-auth unsafe requests from a cross-site Origin", async () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    process.env.CORS_ALLOWED_ORIGINS = "http://127.0.0.1:31234";
    const request = buildRequest({
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        Host: "127.0.0.1:31234",
      },
    });
    const response = buildResponse();
    const next = jest.fn();

    await validatedRequest(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "Cross-origin desktop requests are not allowed.",
    });
  });

  test("rejects desktop no-auth unsafe requests with cross-site fetch metadata", async () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    const request = buildRequest({
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "cross-site",
        Host: "127.0.0.1:31234",
      },
    });
    const response = buildResponse();
    const next = jest.fn();

    await validatedRequest(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "Cross-site desktop requests are not allowed.",
    });
  });

  test("allows desktop no-auth unsafe requests from the configured Electron app origin", async () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    process.env.CORS_ALLOWED_ORIGINS = "http://127.0.0.1:31234";
    const request = buildRequest({
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:31234",
        "Sec-Fetch-Site": "same-origin",
        Host: "127.0.0.1:31234",
      },
    });
    const response = buildResponse();
    const next = jest.fn();

    await validatedRequest(request, response, next);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("allows desktop no-auth unsafe requests without browser origin headers", async () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    const request = buildRequest({
      method: "POST",
      headers: {
        Host: "127.0.0.1:31234",
      },
    });
    const response = buildResponse();
    const next = jest.fn();

    await validatedRequest(request, response, next);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
