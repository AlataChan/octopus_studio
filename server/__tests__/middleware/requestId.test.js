/**
 * 请求追踪 ID 中间件测试
 */

const {
  requestIdMiddleware,
  getRequestId,
  REQUEST_ID_CONFIG,
} = require("../../middleware/requestId");
const { mockRequest, mockResponse, mockNext } = require("../utils/testHelpers");

describe("Request ID Middleware", () => {
  describe("Configuration", () => {
    it("should have correct default configuration", () => {
      expect(REQUEST_ID_CONFIG.HEADER_NAME).toBe("X-Request-ID");
      expect(REQUEST_ID_CONFIG.EXPOSE_IN_RESPONSE).toBe(true);
    });
  });

  describe("requestIdMiddleware", () => {
    it("should generate a new request ID when none provided", () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      requestIdMiddleware(req, res, next);

      expect(req.requestId).toBeDefined();
      expect(typeof req.requestId).toBe("string");
      expect(req.requestId.length).toBe(8); // Short ID format
      expect(next).toHaveBeenCalled();
    });

    it("should use client-provided request ID", () => {
      const clientRequestId = "client-id-123";
      const req = mockRequest({
        headers: { "x-request-id": clientRequestId },
      });
      const res = mockResponse();
      const next = mockNext();

      requestIdMiddleware(req, res, next);

      expect(req.requestId).toBe(clientRequestId);
      expect(next).toHaveBeenCalled();
    });

    it("should set response header with request ID", () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      requestIdMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        "X-Request-ID",
        expect.any(String)
      );
    });

    it("should generate unique IDs for different requests", () => {
      const req1 = mockRequest();
      const req2 = mockRequest();
      const res1 = mockResponse();
      const res2 = mockResponse();
      const next = mockNext();

      requestIdMiddleware(req1, res1, next);
      requestIdMiddleware(req2, res2, next);

      expect(req1.requestId).not.toBe(req2.requestId);
    });
  });

  describe("getRequestId", () => {
    it("should return request ID from request object", () => {
      const req = { requestId: "test-id-123" };
      expect(getRequestId(req)).toBe("test-id-123");
    });

    it("should return null for undefined request", () => {
      expect(getRequestId(undefined)).toBeNull();
    });

    it("should return null when request has no requestId", () => {
      const req = {};
      expect(getRequestId(req)).toBeNull();
    });
  });
});

