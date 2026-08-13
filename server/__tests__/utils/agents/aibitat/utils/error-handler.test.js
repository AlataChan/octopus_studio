/**
 * @fileoverview PluginErrorHandler 单元测试
 */

const { PluginErrorHandler } = require("../../../../../utils/agents/aibitat/utils/error-handler");

describe("PluginErrorHandler", () => {
  describe("handle()", () => {
    let mockContext;
    let consoleSpy;

    beforeEach(() => {
      mockContext = {
        super: {
          handlerProps: {
            log: jest.fn(),
          },
          introspect: jest.fn(),
        },
      };
      consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("should return JSON formatted error response by default", () => {
      const error = new Error("Test error");
      const result = PluginErrorHandler.handle(mockContext, error, {
        plugin: "test-plugin",
        caller: "testFunction",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Test error");
      expect(parsed.code).toBe("UNKNOWN_ERROR");
    });

    it("should include error code if provided", () => {
      const error = new Error("Network failed");
      error.code = "NETWORK_ERROR";

      const result = PluginErrorHandler.handle(mockContext, error, {
        plugin: "web-browsing",
        caller: "search",
      });

      const parsed = JSON.parse(result);
      expect(parsed.code).toBe("NETWORK_ERROR");
    });

    it("should call introspect when enabled", () => {
      const error = new Error("Test error");
      PluginErrorHandler.handle(mockContext, error, {
        plugin: "test-plugin",
        caller: "testFunction",
        introspect: true,
      });

      expect(mockContext.super.introspect).toHaveBeenCalledWith(
        "testFunction: 操作失败 - Test error"
      );
    });

    it("should not call introspect when disabled", () => {
      const error = new Error("Test error");
      PluginErrorHandler.handle(mockContext, error, {
        plugin: "test-plugin",
        caller: "testFunction",
        introspect: false,
      });

      expect(mockContext.super.introspect).not.toHaveBeenCalled();
    });

    it("should return plain text when returnJson is false", () => {
      const error = new Error("Test error");
      const result = PluginErrorHandler.handle(mockContext, error, {
        plugin: "test-plugin",
        caller: "testFunction",
        returnJson: false,
        hint: "请重试",
      });

      expect(result).toBe("操作失败: Test error。请重试");
    });

    it("should use console.error when context.log is not available", () => {
      const error = new Error("Test error");
      PluginErrorHandler.handle({}, error, {
        plugin: "test-plugin",
        caller: "testFunction",
      });

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("createError()", () => {
    it("should create an error with code property", () => {
      const error = PluginErrorHandler.createError("Custom error", "CUSTOM_CODE");

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Custom error");
      expect(error.code).toBe("CUSTOM_CODE");
    });
  });

  describe("ErrorCodes", () => {
    it("should have all expected error codes", () => {
      expect(PluginErrorHandler.ErrorCodes.CONFIG_MISSING).toBe("CONFIG_MISSING");
      expect(PluginErrorHandler.ErrorCodes.NETWORK_ERROR).toBe("NETWORK_ERROR");
      expect(PluginErrorHandler.ErrorCodes.TIMEOUT).toBe("TIMEOUT");
      expect(PluginErrorHandler.ErrorCodes.PERMISSION_DENIED).toBe("PERMISSION_DENIED");
    });
  });

  describe("getHint()", () => {
    it("should return correct hint for known error codes", () => {
      expect(PluginErrorHandler.getHint("TIMEOUT")).toBe("操作超时，请稍后重试");
      expect(PluginErrorHandler.getHint("API_KEY_MISSING")).toBe("缺少必要的 API 密钥，请在设置中配置");
    });

    it("should return default hint for unknown error codes", () => {
      expect(PluginErrorHandler.getHint("UNKNOWN_CODE")).toBe("请稍后重试或联系管理员");
    });
  });
});

