/**
 * 工具调用统计模块测试
 */

const { ToolStatsManager, toolStats } = require("../../utils/agents/toolStats");

describe("ToolStatsManager", () => {
  let manager;

  beforeEach(() => {
    manager = new ToolStatsManager();
  });

  describe("startCall", () => {
    it("should return a unique call ID", () => {
      const callId1 = manager.startCall("test-tool");
      const callId2 = manager.startCall("test-tool");
      expect(callId1).not.toBe(callId2);
    });

    it("should increment total calls", () => {
      manager.startCall("test-tool");
      manager.startCall("test-tool");
      const stats = manager.getToolStats("test-tool");
      expect(stats.totalCalls).toBe(2);
    });

    it("should track active calls", () => {
      manager.startCall("test-tool");
      const stats = manager.getToolStats("test-tool");
      expect(stats.activeCalls).toBe(1);
    });
  });

  describe("endCall", () => {
    it("should record successful call", () => {
      const callId = manager.startCall("test-tool");
      manager.endCall("test-tool", callId, true);
      const stats = manager.getToolStats("test-tool");
      expect(stats.successCalls).toBe(1);
      expect(stats.failedCalls).toBe(0);
    });

    it("should record failed call", () => {
      const callId = manager.startCall("test-tool");
      manager.endCall("test-tool", callId, false);
      const stats = manager.getToolStats("test-tool");
      expect(stats.successCalls).toBe(0);
      expect(stats.failedCalls).toBe(1);
    });

    it("should remove from active calls", () => {
      const callId = manager.startCall("test-tool");
      manager.endCall("test-tool", callId, true);
      const stats = manager.getToolStats("test-tool");
      expect(stats.activeCalls).toBe(0);
    });

    it("should track metadata on failure", () => {
      const callId = manager.startCall("test-tool");
      manager.endCall("test-tool", callId, false, { error: "Test error" });
      // 内部存储了 metadata
      expect(manager.stats.get("test-tool").lastMetadata).toEqual({ error: "Test error" });
    });
  });

  describe("getToolStats", () => {
    it("should return null for unknown tool", () => {
      expect(manager.getToolStats("unknown")).toBeNull();
    });

    it("should calculate success rate", () => {
      const callId1 = manager.startCall("test-tool");
      const callId2 = manager.startCall("test-tool");
      const callId3 = manager.startCall("test-tool");

      manager.endCall("test-tool", callId1, true);
      manager.endCall("test-tool", callId2, true);
      manager.endCall("test-tool", callId3, false);

      const stats = manager.getToolStats("test-tool");
      expect(stats.successRate).toBe("66.7%");
    });
  });

  describe("getAllStats", () => {
    it("should return summary of all tools", () => {
      manager.startCall("tool-a");
      manager.startCall("tool-b");
      manager.startCall("tool-b");

      const allStats = manager.getAllStats();
      expect(allStats.summary.totalTools).toBe(2);
      expect(allStats.summary.totalCalls).toBe(3);
    });

    it("should sort tools by call count", () => {
      manager.startCall("tool-a");
      manager.startCall("tool-b");
      manager.startCall("tool-b");

      const allStats = manager.getAllStats();
      expect(allStats.tools[0].name).toBe("tool-b");
      expect(allStats.tools[1].name).toBe("tool-a");
    });
  });

  describe("getTopTools", () => {
    it("should return top N tools", () => {
      for (let i = 0; i < 10; i++) manager.startCall("tool-a");
      for (let i = 0; i < 5; i++) manager.startCall("tool-b");
      for (let i = 0; i < 3; i++) manager.startCall("tool-c");

      const top2 = manager.getTopTools(2);
      expect(top2).toHaveLength(2);
      expect(top2[0].name).toBe("tool-a");
      expect(top2[1].name).toBe("tool-b");
    });
  });

  describe("reset", () => {
    it("should clear all stats", () => {
      manager.startCall("test-tool");
      manager.reset();
      expect(manager.getAllStats().summary.totalTools).toBe(0);
    });
  });

  describe("exportToJson", () => {
    it("should return valid JSON string", () => {
      manager.startCall("test-tool");
      const json = manager.exportToJson();
      const parsed = JSON.parse(json);
      expect(parsed.summary).toBeDefined();
    });
  });
});

describe("Global toolStats instance", () => {
  it("should be a ToolStatsManager instance", () => {
    expect(toolStats).toBeInstanceOf(ToolStatsManager);
  });
});

