/**
 * 工具调用统计模块
 *
 * @description
 * 追踪和记录 Agent 工具调用的统计信息，
 * 包括调用次数、成功率、平均耗时等。
 */

/**
 * 工具调用统计管理器
 */
class ToolStatsManager {
  constructor() {
    this.stats = new Map();
    this.sessionStart = Date.now();
  }

  /**
   * 记录工具调用开始
   * @param {string} toolName - 工具名称
   * @returns {string} 调用 ID
   */
  startCall(toolName) {
    const callId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (!this.stats.has(toolName)) {
      this.stats.set(toolName, {
        name: toolName,
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        totalDuration: 0,
        lastCalled: null,
        activeCalls: new Map(),
      });
    }

    const stat = this.stats.get(toolName);
    stat.totalCalls++;
    stat.activeCalls.set(callId, { startTime: Date.now() });
    stat.lastCalled = new Date().toISOString();

    return callId;
  }

  /**
   * 记录工具调用结束
   * @param {string} toolName - 工具名称
   * @param {string} callId - 调用 ID
   * @param {boolean} success - 是否成功
   * @param {Object} metadata - 额外元数据
   */
  endCall(toolName, callId, success = true, metadata = {}) {
    const stat = this.stats.get(toolName);
    if (!stat) return;

    const activeCall = stat.activeCalls.get(callId);
    if (activeCall) {
      const duration = Date.now() - activeCall.startTime;
      stat.totalDuration += duration;
      stat.activeCalls.delete(callId);
    }

    if (success) {
      stat.successCalls++;
    } else {
      stat.failedCalls++;
    }

    // 存储最后一次调用的元数据
    if (Object.keys(metadata).length > 0) {
      stat.lastMetadata = metadata;
    }
  }

  /**
   * 获取单个工具的统计信息
   * @param {string} toolName - 工具名称
   * @returns {Object|null} 统计信息
   */
  getToolStats(toolName) {
    const stat = this.stats.get(toolName);
    if (!stat) return null;

    const completedCalls = stat.successCalls + stat.failedCalls;
    return {
      name: stat.name,
      totalCalls: stat.totalCalls,
      completedCalls,
      successCalls: stat.successCalls,
      failedCalls: stat.failedCalls,
      successRate:
        completedCalls > 0
          ? ((stat.successCalls / completedCalls) * 100).toFixed(1) + "%"
          : "N/A",
      avgDuration:
        completedCalls > 0
          ? Math.round(stat.totalDuration / completedCalls) + "ms"
          : "N/A",
      lastCalled: stat.lastCalled,
      activeCalls: stat.activeCalls.size,
    };
  }

  /**
   * 获取所有工具的统计信息
   * @returns {Object} 所有统计信息
   */
  getAllStats() {
    const tools = [];
    let totalCalls = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const [toolName] of this.stats) {
      const toolStat = this.getToolStats(toolName);
      tools.push(toolStat);
      totalCalls += toolStat.totalCalls;
      totalSuccess += toolStat.successCalls;
      totalFailed += toolStat.failedCalls;
    }

    // 按调用次数排序
    tools.sort((a, b) => b.totalCalls - a.totalCalls);

    return {
      sessionStart: new Date(this.sessionStart).toISOString(),
      sessionDuration:
        Math.round((Date.now() - this.sessionStart) / 1000) + "s",
      summary: {
        totalTools: this.stats.size,
        totalCalls,
        totalSuccess,
        totalFailed,
        overallSuccessRate:
          totalCalls > 0
            ? ((totalSuccess / (totalSuccess + totalFailed)) * 100).toFixed(1) +
              "%"
            : "N/A",
      },
      tools,
    };
  }

  /**
   * 获取热门工具（按调用次数）
   * @param {number} limit - 返回数量
   * @returns {Array} 热门工具列表
   */
  getTopTools(limit = 5) {
    const allStats = this.getAllStats();
    return allStats.tools.slice(0, limit);
  }

  /**
   * 重置统计信息
   */
  reset() {
    this.stats.clear();
    this.sessionStart = Date.now();
  }

  /**
   * 导出统计数据为 JSON
   * @returns {string} JSON 字符串
   */
  exportToJson() {
    return JSON.stringify(this.getAllStats(), null, 2);
  }
}

// 创建全局单例
const globalToolStats = new ToolStatsManager();

module.exports = {
  ToolStatsManager,
  toolStats: globalToolStats,
};
