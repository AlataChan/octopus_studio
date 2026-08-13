const mockIsMultiUserMode = jest.fn();

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    isMultiUserMode: (...args) => mockIsMultiUserMode(...args),
  },
}));

const {
  desktopOriginProtection,
} = require("../../utils/middleware/desktopOriginProtection");

function buildRequest({
  method = "POST",
  headers = {},
  protocol = "http",
} = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    method,
    protocol,
    secure: protocol === "https",
    header: jest.fn(
      (name) => normalizedHeaders[String(name).toLowerCase()] || null
    ),
  };
}

function buildResponse() {
  return {
    status: jest.fn(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function (body) {
      this.body = body;
      return this;
    }),
  };
}

describe("desktopOriginProtection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMultiUserMode.mockResolvedValue(false);

    process.env.NODE_ENV = "production";
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    delete process.env.AUTH_TOKEN;
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("rejects desktop no-auth unsafe requests from a cross-site Origin before route auth", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "http://127.0.0.1:31234";
    const request = buildRequest({
      headers: {
        Origin: "https://evil.example",
        Host: "127.0.0.1:31234",
      },
    });
    const response = buildResponse();
    const next = jest.fn();

    await desktopOriginProtection(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "Cross-origin desktop requests are not allowed.",
    });
  });

  test("rejects desktop no-auth unsafe requests with cross-site fetch metadata", async () => {
    const request = buildRequest({
      headers: {
        "Sec-Fetch-Site": "cross-site",
        Host: "127.0.0.1:31234",
      },
    });
    const response = buildResponse();
    const next = jest.fn();

    await desktopOriginProtection(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "Cross-site desktop requests are not allowed.",
    });
  });

  test("allows desktop no-auth unsafe requests from the configured Electron app origin", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "http://127.0.0.1:31234";
    const request = buildRequest({
      headers: {
        Origin: "http://127.0.0.1:31234",
        "Sec-Fetch-Site": "same-origin",
        Host: "127.0.0.1:31234",
      },
    });
    const response = buildResponse();
    const next = jest.fn();

    await desktopOriginProtection(request, response, next);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("leaves authenticated or non-desktop runtimes to the normal auth path", async () => {
    process.env.AUTH_TOKEN = "configured-password";
    const request = buildRequest({
      headers: {
        Origin: "https://evil.example",
        "Sec-Fetch-Site": "cross-site",
        Host: "127.0.0.1:31234",
      },
    });
    const response = buildResponse();
    const next = jest.fn();

    await desktopOriginProtection(request, response, next);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
