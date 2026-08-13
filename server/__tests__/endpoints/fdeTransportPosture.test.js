const jwt = require("jsonwebtoken");

const mockIsMultiUserMode = jest.fn();
const mockGetUser = jest.fn();

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: { isMultiUserMode: (...args) => mockIsMultiUserMode(...args) },
}));
jest.mock("../../models/user", () => ({
  User: { get: (...args) => mockGetUser(...args) },
}));

const { validatedRequest } = require("../../utils/middleware/validatedRequest");
const {
  desktopOriginProtection,
} = require("../../utils/middleware/desktopOriginProtection");

function request(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    method: "POST",
    path: "/api/workspace/clinic-a/fde-workflows/import",
    protocol: "http",
    header: jest.fn((name) => normalized[String(name).toLowerCase()] || null),
  };
}

function response() {
  return {
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
}

describe("FDE route CSRF and transport posture", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "fde-route-posture-test-secret";
    delete process.env.AUTH_TOKEN;
    delete process.env.ANYTHING_LLM_RUNTIME;
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not authorize an FDE mutation from a cookie", async () => {
    mockIsMultiUserMode.mockResolvedValue(true);
    const res = response();
    const next = jest.fn();

    await validatedRequest(request({ Cookie: "session=attacker" }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: "No auth token found." });
  });

  it("accepts a valid production Authorization bearer for an FDE mutation", async () => {
    mockIsMultiUserMode.mockResolvedValue(true);
    mockGetUser.mockResolvedValue({ id: 12, role: "default", suspended: false });
    const token = jwt.sign({ id: 12 }, process.env.JWT_SECRET, { expiresIn: "5m" });
    const res = response();
    const next = jest.fn();

    await validatedRequest(request({ Authorization: `Bearer ${token}` }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.user).toMatchObject({ id: 12, role: "default" });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a desktop no-auth cross-origin FDE POST", async () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    process.env.CORS_ALLOWED_ORIGINS = "http://127.0.0.1:31234";
    mockIsMultiUserMode.mockResolvedValue(false);
    const res = response();
    const next = jest.fn();

    await desktopOriginProtection(
      request({ Origin: "https://evil.example", Host: "127.0.0.1:31234" }),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
