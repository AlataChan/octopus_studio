/**
 * API 限流中间件测试
 */

const {
  generalLimiter,
  authLimiter,
  chatLimiter,
  chatConcurrencyLimiter,
  strictLimiter,
  createCustomLimiter,
  RATE_LIMIT_CONFIG,
  _concurrentRequests,
} = require("../../middleware/rateLimiter");
const { mockRequest, mockResponse, mockNext } = require("../utils/testHelpers");

describe("Rate Limiter Middleware", () => {
  // 每次测试前清空并发计数
  beforeEach(() => {
    _concurrentRequests.clear();
  });

  describe("Configuration", () => {
    it("should have correct default configuration values", () => {
      // 实际配置：300/1min（通用限流）
      expect(RATE_LIMIT_CONFIG.GENERAL_WINDOW_MS).toBe(60 * 1000);
      expect(RATE_LIMIT_CONFIG.GENERAL_MAX_REQUESTS).toBe(300);
      expect(RATE_LIMIT_CONFIG.AUTH_WINDOW_MS).toBe(15 * 60 * 1000);
      expect(RATE_LIMIT_CONFIG.AUTH_MAX_REQUESTS).toBe(10);
      // 实际配置：30/1min（聊天限流）
      expect(RATE_LIMIT_CONFIG.CHAT_WINDOW_MS).toBe(60 * 1000);
      expect(RATE_LIMIT_CONFIG.CHAT_MAX_REQUESTS).toBe(30);
      expect(RATE_LIMIT_CONFIG.CHAT_MAX_CONCURRENT).toBe(5);
      expect(RATE_LIMIT_CONFIG.STRICT_WINDOW_MS).toBe(60 * 60 * 1000);
      expect(RATE_LIMIT_CONFIG.STRICT_MAX_REQUESTS).toBe(10);
    });
  });

  describe("generalLimiter", () => {
    it("should be a function (middleware)", () => {
      expect(typeof generalLimiter).toBe("function");
    });

    it("should allow request within rate limit", async () => {
      const req = mockRequest({ ip: "192.168.1.100" });
      const res = mockResponse();
      const next = mockNext();

      await generalLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("authLimiter", () => {
    it("should be a function (middleware)", () => {
      expect(typeof authLimiter).toBe("function");
    });

    it("should allow first request", async () => {
      const req = mockRequest({ ip: "192.168.1.101" });
      const res = mockResponse();
      const next = mockNext();

      await authLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("chatLimiter", () => {
    it("should be a function (middleware)", () => {
      expect(typeof chatLimiter).toBe("function");
    });

    it("should use user ID for rate limiting when available", async () => {
      const req = mockRequest({
        ip: "192.168.1.102",
        user: { id: 123 },
      });
      const res = mockResponse();
      const next = mockNext();

      await chatLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("strictLimiter", () => {
    it("should be a function (middleware)", () => {
      expect(typeof strictLimiter).toBe("function");
    });
  });

  describe("createCustomLimiter", () => {
    it("should create a custom rate limiter with specified options", () => {
      const customLimiter = createCustomLimiter({
        windowMs: 5000,
        max: 3,
        message: "Custom rate limit exceeded",
      });

      expect(typeof customLimiter).toBe("function");
    });

    it("should use default message when not provided", () => {
      const customLimiter = createCustomLimiter({
        windowMs: 5000,
        max: 3,
      });

      expect(typeof customLimiter).toBe("function");
    });
  });

  describe("chatConcurrencyLimiter", () => {
    it("should be a function (middleware)", () => {
      expect(typeof chatConcurrencyLimiter).toBe("function");
    });

    it("should allow request when under concurrent limit", () => {
      const req = mockRequest({ ip: "192.168.1.200" });
      const res = mockResponse();
      const next = mockNext();

      chatConcurrencyLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(_concurrentRequests.get("192.168.1.200")).toBe(1);
    });

    it("should track multiple concurrent requests", () => {
      const ip = "192.168.1.201";

      // 模拟 5 个并发请求（达到限制）
      for (let i = 0; i < 5; i++) {
        const req = mockRequest({ ip });
        const res = mockResponse();
        const next = mockNext();
        chatConcurrencyLimiter(req, res, next);
      }

      expect(_concurrentRequests.get(ip)).toBe(5);
    });

    it("should reject request when at concurrent limit", () => {
      const ip = "192.168.1.202";

      // 先达到并发限制
      for (let i = 0; i < 5; i++) {
        const req = mockRequest({ ip });
        const res = mockResponse();
        const next = mockNext();
        chatConcurrencyLimiter(req, res, next);
      }

      // 第 6 个请求应该被拒绝
      const req = mockRequest({ ip });
      const res = mockResponse();
      const next = mockNext();

      chatConcurrencyLimiter(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: "RATE_LIMIT_EXCEEDED",
        })
      );
    });

    it("should decrease count when response finishes", () => {
      const ip = "192.168.1.203";
      const req = mockRequest({ ip });
      const res = mockResponse();
      const next = mockNext();

      chatConcurrencyLimiter(req, res, next);
      expect(_concurrentRequests.get(ip)).toBe(1);

      // 模拟响应结束
      res.emit("finish");
      expect(_concurrentRequests.get(ip)).toBeUndefined();
    });

    it("should handle different IPs independently", () => {
      const ip1 = "192.168.1.204";
      const ip2 = "192.168.1.205";

      const req1 = mockRequest({ ip: ip1 });
      const res1 = mockResponse();
      const next1 = mockNext();

      const req2 = mockRequest({ ip: ip2 });
      const res2 = mockResponse();
      const next2 = mockNext();

      chatConcurrencyLimiter(req1, res1, next1);
      chatConcurrencyLimiter(req2, res2, next2);

      expect(_concurrentRequests.get(ip1)).toBe(1);
      expect(_concurrentRequests.get(ip2)).toBe(1);
    });
  });
});

