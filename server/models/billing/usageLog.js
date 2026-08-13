const prisma = require("../../utils/prisma");

/**
 * @typedef {Object} UsageLog
 * @property {number} id
 * @property {number} userId
 * @property {number} workspaceId
 * @property {string|null} assistantId
 * @property {string} modelGroup - international/domestic/premium
 * @property {string} modelName
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} creditsUsed
 * @property {string} apiEndpoint
 * @property {Date} createdAt
 */

/**
 * Token 定价配置 (积分/1k tokens)
 * 1积分 = ¥0.001
 *
 * 三级定价体系:
 * - premium: 高端推理模型（Claude 3 Opus, GPT-4 Turbo）
 * - international: 国际标准模型（GPT-4o, Claude 3.5 Sonnet）
 * - domestic: 国内高性价比模型（DeepSeek, Qwen）
 */
const TOKEN_PRICING = {
  premium: {
    input: 200, // ¥0.20/1k tokens
    output: 1000, // ¥1.00/1k tokens
    description: "高端推理模型",
  },
  international: {
    input: 100, // ¥0.10/1k tokens
    output: 500, // ¥0.50/1k tokens
    description: "国际标准模型",
  },
  domestic: {
    input: 5, // ¥0.005/1k tokens
    output: 10, // ¥0.01/1k tokens
    description: "国内高性价比模型",
  },
};

/**
 * 模型分组映射（完整版）
 */
const MODEL_GROUP_MAP = {
  // 高端组 (Premium)
  "claude-3-opus": "premium",
  "claude-3-opus-20240229": "premium",
  "gpt-4-turbo": "premium",
  "gpt-4-turbo-preview": "premium",
  "gpt-4-0125-preview": "premium",
  "o1-preview": "premium",
  "o1-mini": "premium",

  // 国际组 (International)
  "claude-3.5-sonnet": "international",
  "claude-3-5-sonnet-20241022": "international",
  "claude-3-sonnet": "international",
  "claude-3-haiku": "international",
  "gpt-4o": "international",
  "gpt-4o-mini": "international",
  "gpt-4": "international",
  "gemini-1.5-pro": "international",
  "gemini-1.5-flash": "international",
  "gemini-2.0-flash": "international",

  // 国内组 (Domestic) - 高性价比
  "deepseek-v3": "domestic",
  "deepseek-chat": "domestic",
  "deepseek-coder": "domestic",
  "deepseek-reasoner": "domestic",
  "qwen-max": "domestic",
  "qwen-max-longcontext": "domestic",
  "qwen-plus": "domestic",
  "qwen-turbo": "domestic",
  "qwen2.5-72b-instruct": "domestic",
  "qwen2.5-32b-instruct": "domestic",
  "glm-4": "domestic",
  "glm-4-plus": "domestic",
  "glm-4-flash": "domestic",
  "moonshot-v1-8k": "domestic",
  "moonshot-v1-32k": "domestic",
  "moonshot-v1-128k": "domestic",
  "yi-large": "domestic",
  "yi-medium": "domestic",
  "minimax-abab6.5s": "domestic",
  // Octopus Studio 默认使用国内组定价
  hireagent: "domestic",
};

const UsageLog = {
  TOKEN_PRICING,
  MODEL_GROUP_MAP,

  /**
   * 获取模型分组
   * @param {string} modelName - 模型名称
   * @returns {string} - premium/international/domestic
   */
  getModelGroup: function (modelName) {
    const normalized = modelName?.toLowerCase() || "";

    // 精确匹配
    if (MODEL_GROUP_MAP[normalized]) {
      return MODEL_GROUP_MAP[normalized];
    }

    // 模糊匹配 - 高端组
    if (normalized.includes("opus") || normalized.includes("o1-")) {
      return "premium";
    }

    // 模糊匹配 - 国际组
    if (
      normalized.includes("claude") ||
      normalized.includes("gpt-") ||
      normalized.includes("gemini")
    ) {
      return "international";
    }

    // 模糊匹配 - 国内组
    if (
      normalized.includes("deepseek") ||
      normalized.includes("qwen") ||
      normalized.includes("glm") ||
      normalized.includes("moonshot") ||
      normalized.includes("yi-") ||
      normalized.includes("minimax")
    ) {
      return "domestic";
    }

    // 默认为国内组(成本较低，对用户友好)
    return "domestic";
  },

  /**
   * 计算 Token 消耗的积分
   * @param {string} modelGroup - 模型分组
   * @param {number} inputTokens - 输入 Token 数
   * @param {number} outputTokens - 输出 Token 数
   * @returns {number} - 消耗的积分
   */
  calculateCredits: function (modelGroup, inputTokens, outputTokens) {
    const pricing = TOKEN_PRICING[modelGroup] || TOKEN_PRICING.domestic;
    const inputCredits = Math.ceil((inputTokens / 1000) * pricing.input);
    const outputCredits = Math.ceil((outputTokens / 1000) * pricing.output);
    return inputCredits + outputCredits;
  },

  /**
   * 记录使用日志
   * @param {Object} data - 使用数据
   * @returns {Promise<{success: boolean, log?: UsageLog, error?: string}>}
   */
  create: async function (data) {
    const {
      userId,
      workspaceId,
      assistantId = null,
      modelName,
      inputTokens = 0,
      outputTokens = 0,
      apiEndpoint = "/chat",
    } = data;

    const modelGroup = this.getModelGroup(modelName);
    const creditsUsed = this.calculateCredits(
      modelGroup,
      inputTokens,
      outputTokens
    );

    try {
      const log = await prisma.usage_logs.create({
        data: {
          userId: parseInt(userId),
          workspaceId: parseInt(workspaceId),
          assistantId,
          modelGroup,
          modelName,
          inputTokens,
          outputTokens,
          creditsUsed,
          apiEndpoint,
        },
      });

      return { success: true, log, creditsUsed };
    } catch (error) {
      console.error("FAILED TO CREATE USAGE LOG.", error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 获取用户使用统计
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>}
   */
  getUserStats: async function (userId, options = {}) {
    const { startDate, endDate } = options;

    const where = { userId: parseInt(userId) };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    try {
      const logs = await prisma.usage_logs.findMany({ where });

      return {
        totalCredits: logs.reduce((sum, l) => sum + l.creditsUsed, 0),
        totalInputTokens: logs.reduce((sum, l) => sum + l.inputTokens, 0),
        totalOutputTokens: logs.reduce((sum, l) => sum + l.outputTokens, 0),
        callCount: logs.length,
        byModelGroup: logs.reduce((acc, l) => {
          if (!acc[l.modelGroup]) acc[l.modelGroup] = { credits: 0, calls: 0 };
          acc[l.modelGroup].credits += l.creditsUsed;
          acc[l.modelGroup].calls++;
          return acc;
        }, {}),
      };
    } catch (error) {
      console.error("FAILED TO GET USER STATS.", error.message);
      return {
        totalCredits: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        callCount: 0,
        byModelGroup: {},
      };
    }
  },

  /**
   * 获取用户使用记录列表
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>}
   */
  getByUser: async function (userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      modelGroup,
      workspaceId,
    } = options;

    const where = { userId: parseInt(userId) };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    if (modelGroup) where.modelGroup = modelGroup;
    if (workspaceId) where.workspaceId = parseInt(workspaceId);

    try {
      const [logs, total] = await Promise.all([
        prisma.usage_logs.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
        }),
        prisma.usage_logs.count({ where }),
      ]);

      return {
        logs,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      };
    } catch (error) {
      console.error("FAILED TO GET USER LOGS.", error.message);
      return { logs: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }
  },

  /**
   * 获取每日使用趋势
   * @param {number} userId - 用户ID
   * @param {number} days - 天数
   * @returns {Promise<Array>}
   */
  getDailyTrend: async function (userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      const logs = await prisma.usage_logs.findMany({
        where: {
          userId: parseInt(userId),
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: "asc" },
      });

      // 按日期分组统计
      const dailyMap = {};
      logs.forEach((log) => {
        const date = log.createdAt.toISOString().split("T")[0];
        if (!dailyMap[date]) {
          dailyMap[date] = {
            date,
            credits: 0,
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
          };
        }
        dailyMap[date].credits += log.creditsUsed;
        dailyMap[date].calls++;
        dailyMap[date].inputTokens += log.inputTokens;
        dailyMap[date].outputTokens += log.outputTokens;
      });

      return Object.values(dailyMap);
    } catch (error) {
      console.error("FAILED TO GET DAILY TREND.", error.message);
      return [];
    }
  },

  /**
   * 获取模型使用排行
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>}
   */
  getModelRanking: async function (userId, options = {}) {
    const { startDate, endDate, limit = 10 } = options;

    const where = { userId: parseInt(userId) };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    try {
      const logs = await prisma.usage_logs.findMany({ where });

      // 按模型分组统计
      const modelMap = {};
      logs.forEach((log) => {
        if (!modelMap[log.modelName]) {
          modelMap[log.modelName] = {
            modelName: log.modelName,
            modelGroup: log.modelGroup,
            credits: 0,
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
          };
        }
        modelMap[log.modelName].credits += log.creditsUsed;
        modelMap[log.modelName].calls++;
        modelMap[log.modelName].inputTokens += log.inputTokens;
        modelMap[log.modelName].outputTokens += log.outputTokens;
      });

      // 按消耗积分排序
      return Object.values(modelMap)
        .sort((a, b) => b.credits - a.credits)
        .slice(0, limit);
    } catch (error) {
      console.error("FAILED TO GET MODEL RANKING.", error.message);
      return [];
    }
  },
};

module.exports = { UsageLog };
