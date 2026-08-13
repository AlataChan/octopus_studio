/**
 * @fileoverview TimeoutManager 单元测试
 */

const { TimeoutManager, DEFAULT_TIMEOUTS } = require("../../../../../utils/agents/aibitat/utils/timeout");
const {
  ToolRetryHandler,
} = require("../../../../../utils/agents/aibitat/utils/toolTimeouts");

describe("TimeoutManager", () => {
  describe("withTimeout()", () => {
    it("should resolve when promise completes before timeout", async () => {
      const fastPromise = new Promise((resolve) => {
        setTimeout(() => resolve("success"), 50);
      });

      const result = await TimeoutManager.withTimeout(fastPromise, 1000);
      expect(result).toBe("success");
    });

    it("should reject with timeout error when promise takes too long", async () => {
      const slowPromise = new Promise(() => {});

      await expect(
        TimeoutManager.withTimeout(slowPromise, 50, "Custom timeout message")
      ).rejects.toThrow("Custom timeout message");
    });

    it("should set error code to TIMEOUT", async () => {
      const slowPromise = new Promise(() => {});

      try {
        await TimeoutManager.withTimeout(slowPromise, 50);
      } catch (error) {
        expect(error.code).toBe("TIMEOUT");
      }
    });

    it("should use default error message when not provided", async () => {
      const slowPromise = new Promise(() => {});

      await expect(TimeoutManager.withTimeout(slowPromise, 50)).rejects.toThrow(
        "Operation timeout after 50ms"
      );
    });

    it("should clear timeout when promise resolves", async () => {
      jest.useFakeTimers();
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      const fastPromise = Promise.resolve("success");
      await TimeoutManager.withTimeout(fastPromise, 1000);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe("createCancelableTimeout()", () => {
    it("should create a cancelable timeout", () => {
      const { promise, cancel } = TimeoutManager.createCancelableTimeout(1000);

      expect(promise).toBeInstanceOf(Promise);
      expect(typeof cancel).toBe("function");

      // Ensure we don't leave a pending timer that rejects after the test exits.
      cancel();
    });

    it("should not reject when canceled before timeout", async () => {
      jest.useFakeTimers();
      const { promise, cancel } = TimeoutManager.createCancelableTimeout(1000);

      // Cancel immediately
      cancel();

      // Advance timers past the timeout
      jest.advanceTimersByTime(2000);

      // Promise should still be pending (not rejected)
      let rejected = false;
      promise.catch(() => {
        rejected = true;
      });

      // Give time for any potential rejection
      await Promise.resolve();
      expect(rejected).toBe(false);

      jest.useRealTimers();
    });
  });

  describe("getDefaults()", () => {
    it("should return a copy of default timeouts", () => {
      const defaults = TimeoutManager.getDefaults();

      expect(defaults).toEqual(DEFAULT_TIMEOUTS);
      expect(defaults).not.toBe(DEFAULT_TIMEOUTS); // Should be a copy
    });

    it("should have expected timeout values", () => {
      const defaults = TimeoutManager.getDefaults();

      expect(defaults.NETWORK).toBe(30_000);
      expect(defaults.SCRAPING).toBe(60_000);
      expect(defaults.SUMMARIZATION).toBe(60_000);
      expect(defaults.DATABASE).toBe(30_000);
    });
  });

  describe("DEFAULT_TIMEOUTS", () => {
    it("should have all expected timeout constants", () => {
      expect(DEFAULT_TIMEOUTS.NETWORK).toBeDefined();
      expect(DEFAULT_TIMEOUTS.SEARCH).toBeDefined();
      expect(DEFAULT_TIMEOUTS.SCRAPING).toBeDefined();
      expect(DEFAULT_TIMEOUTS.SUMMARIZATION).toBeDefined();
      expect(DEFAULT_TIMEOUTS.DATABASE).toBeDefined();
      expect(DEFAULT_TIMEOUTS.MCP_TOOL).toBeDefined();
      expect(DEFAULT_TIMEOUTS.FILE_OPERATION).toBeDefined();
    });
  });
});

describe("ToolRetryHandler", () => {
  test("shouldRetry rejects permission and validation failures", () => {
    const retryHandler = new ToolRetryHandler();

    expect(
      retryHandler.shouldRetry(
        { type: "permissionDenied", message: "permission denied" },
        "write-file"
      )
    ).toBe(false);
    expect(
      retryHandler.shouldRetry(
        { type: "cancelled", message: "cancelled by user" },
        "web-search"
      )
    ).toBe(false);
    expect(
      retryHandler.shouldRetry(
        { message: "schema validation failed: missing required field" },
        "memory"
      )
    ).toBe(false);
  });

  test("shouldRetry allows timeout, network, rate-limit and MCP transport errors", () => {
    const retryHandler = new ToolRetryHandler();

    expect(
      retryHandler.shouldRetry({ code: "TIMEOUT", message: "tool timed out" })
    ).toBe(true);
    expect(
      retryHandler.shouldRetry({ code: "ECONNRESET", message: "socket hang up" })
    ).toBe(true);
    expect(
      retryHandler.shouldRetry({ message: "429 rate limit exceeded" })
    ).toBe(true);
    expect(
      retryHandler.shouldRetry({ message: "MCP transport connection lost" })
    ).toBe(true);
  });
});
