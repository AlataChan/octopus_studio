const express = require("express");
const request = require("supertest");

const mockIsMultiUserMode = jest.fn();
const mockCreate = jest.fn();
const mockGetUnreadCount = jest.fn();

jest.mock("../utils/middleware/validatedRequest", () => ({
  validatedRequest: (request, response, next) => {
    if (request.header("x-test-auth") === "none") {
      return response.status(401).json({ success: false, error: "No auth" });
    }

    const multiUserMode = request.header("x-test-mode") === "multi";
    response.locals.multiUserMode = multiUserMode;
    if (multiUserMode) {
      const user = {
        id: Number(request.header("x-test-user-id") || 7),
        role: request.header("x-test-role") || "default",
      };
      request.user = user;
      response.locals.user = user;
    }

    return next();
  },
}));

jest.mock("../models/systemSettings", () => ({
  SystemSettings: {
    isMultiUserMode: (...args) => mockIsMultiUserMode(...args),
  },
}));

jest.mock("../models/notification", () => ({
  Notification: {
    create: (...args) => mockCreate(...args),
    getUnreadCount: (...args) => mockGetUnreadCount(...args),
  },
}));

const { notificationEndpoints } = require("../endpoints/notifications");

describe("notification endpoints in single-user mode", () => {
  let originalNodeEnv;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    mockIsMultiUserMode.mockResolvedValue(false);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  test("GET /notifications/unread-count returns an empty success response", async () => {
    const app = express();
    app.use(express.json());
    notificationEndpoints(app);

    const response = await request(app)
      .get("/notifications/unread-count")
      .expect(200);

    expect(response.body).toEqual({ success: true, count: 0 });
    expect(mockGetUnreadCount).not.toHaveBeenCalled();
  });

  test("POST /admin/notifications/test rejects multi-user non-admin users", async () => {
    const app = express();
    app.use(express.json());
    notificationEndpoints(app);

    const response = await request(app)
      .post("/admin/notifications/test")
      .set("x-test-mode", "multi")
      .set("x-test-role", "default")
      .send({ title: "test" })
      .expect(403);

    expect(response.body).toEqual({
      success: false,
      error: "Forbidden: system admin required",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("POST /admin/notifications/test lets multi-user admins create self-scoped test notifications", async () => {
    mockCreate.mockResolvedValue({
      notification: { id: 1, userId: 99, title: "Admin test" },
    });
    const app = express();
    app.use(express.json());
    notificationEndpoints(app);

    const response = await request(app)
      .post("/admin/notifications/test")
      .set("x-test-mode", "multi")
      .set("x-test-role", "admin")
      .set("x-test-user-id", "99")
      .send({ title: "Admin test", content: "hello" })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      notification: { id: 1, userId: 99, title: "Admin test" },
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 99,
        title: "Admin test",
        content: "hello",
        metadata: { test: true },
      })
    );
  });

  test("POST /admin/notifications/test keeps existing single-user 401 behavior", async () => {
    const app = express();
    app.use(express.json());
    notificationEndpoints(app);

    const response = await request(app)
      .post("/admin/notifications/test")
      .send({ title: "test" })
      .expect(401);

    expect(response.body).toEqual({ success: false, error: "未授权" });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
