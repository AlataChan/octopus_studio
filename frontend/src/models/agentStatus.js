import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * Agent 状态查询 API
 * 用于 Slash Command 获取工具、Flow、MCP 状态
 */
const AgentStatus = {
  /**
   * 获取可用的 Agent 工具列表
   * @returns {Promise<{tools: Array}>}
   */
  getTools: async function () {
    return await fetch(`${API_BASE}/agent-status/tools`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("Error fetching agent tools:", e);
        return { success: false, tools: [], error: e.message };
      });
  },

  /**
   * 获取已激活的 Agent Flow 列表
   * @returns {Promise<{flows: Array}>}
   */
  getFlows: async function () {
    return await fetch(`${API_BASE}/agent-status/flows`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("Error fetching agent flows:", e);
        return { success: false, flows: [], error: e.message };
      });
  },

  /**
   * 获取 MCP 服务器状态
   * @returns {Promise<{servers: Array}>}
   */
  getMCPStatus: async function () {
    return await fetch(`${API_BASE}/agent-status/mcp`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("Error fetching MCP status:", e);
        return { success: false, servers: [], error: e.message };
      });
  },

  /**
   * 获取 Agent 状态汇总
   * @returns {Promise<{summary: Object}>}
   */
  getSummary: async function () {
    return await fetch(`${API_BASE}/agent-status/summary`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error("Error fetching agent status summary:", e);
        return { success: false, summary: null, error: e.message };
      });
  },
};

export default AgentStatus;
