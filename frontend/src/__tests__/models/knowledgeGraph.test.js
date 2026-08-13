/**
 * 知识图谱前端模型测试
 *
 * 注意：运行此测试需要先安装 vitest
 * npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
 *
 * 然后在 package.json 中添加:
 * "scripts": { "test": "vitest" }
 *
 * 并创建 vitest.config.js
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch
global.fetch = vi.fn();

// 模拟 API 基础配置
const API_BASE = "http://localhost:3001/api";

/**
 * 模拟 KnowledgeGraph API 模型
 * 用于测试 API 调用逻辑
 */
const KnowledgeGraph = {
  getGraph: async (slug, options = {}) => {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", options.limit);
    if (options.q) params.append("q", options.q);
    if (options.types) params.append("types", options.types.join(","));

    const response = await fetch(
      `${API_BASE}/v1/workspace/${slug}/knowledge-graph?${params.toString()}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );
    return response.json();
  },

  search: async (slug, keyword, limit = 10) => {
    const response = await fetch(
      `${API_BASE}/v1/workspace/${slug}/knowledge-graph/search?q=${encodeURIComponent(keyword)}&limit=${limit}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );
    return response.json();
  },

  build: async (slug, options = {}) => {
    const response = await fetch(
      `${API_BASE}/v1/workspace/${slug}/knowledge-graph/build`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      }
    );
    return response.json();
  },

  getBuildStatus: async (slug, taskId) => {
    const url = taskId
      ? `${API_BASE}/v1/workspace/${slug}/knowledge-graph/build/status?taskId=${taskId}`
      : `${API_BASE}/v1/workspace/${slug}/knowledge-graph/build/status`;

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    return response.json();
  },
};

describe("KnowledgeGraph API Model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getGraph", () => {
    it("should call API with correct parameters", async () => {
      const mockResponse = {
        success: true,
        data: { nodes: [], links: [], stats: { nodeCount: 0, edgeCount: 0 } },
      };
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      });

      const result = await KnowledgeGraph.getGraph("test-workspace", {
        limit: 100,
        q: "测试",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/workspace/test-workspace/knowledge-graph"),
        expect.objectContaining({ method: "GET" })
      );
      expect(result.success).toBe(true);
    });

    it("should handle API errors gracefully", async () => {
      const mockError = { success: false, error: "工作区不存在" };
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockError),
      });

      const result = await KnowledgeGraph.getGraph("invalid-workspace");

      expect(result.success).toBe(false);
      expect(result.error).toBe("工作区不存在");
    });
  });

  describe("search", () => {
    it("should search nodes with keyword", async () => {
      const mockResponse = {
        success: true,
        data: {
          nodes: [
            { id: "node_1", label: "API 文档", type: "document" },
            { id: "node_2", label: "API 设计", type: "document" },
          ],
        },
      };
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      });

      const result = await KnowledgeGraph.search("test-workspace", "API", 10);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("q=API"),
        expect.any(Object)
      );
      expect(result.data.nodes).toHaveLength(2);
    });
  });

  describe("build", () => {
    it("should trigger graph build", async () => {
      const mockResponse = {
        success: true,
        data: { taskId: "task_123", message: "构建任务已创建" },
      };
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      });

      const result = await KnowledgeGraph.build("test-workspace", {
        mode: "full",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/knowledge-graph/build"),
        expect.objectContaining({ method: "POST" })
      );
      expect(result.data.taskId).toBe("task_123");
    });
  });

  describe("getBuildStatus", () => {
    it("should get build status by taskId", async () => {
      const mockResponse = {
        success: true,
        data: { status: "running", progress: 50, message: "处理中..." },
      };
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
      });

      const result = await KnowledgeGraph.getBuildStatus(
        "test-workspace",
        "task_123"
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("taskId=task_123"),
        expect.any(Object)
      );
      expect(result.data.progress).toBe(50);
    });
  });
});
