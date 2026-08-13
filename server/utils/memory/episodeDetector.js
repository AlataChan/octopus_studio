/**
 * Episode 自动检测器
 *
 * Phase 2: 使用轻量级 LLM 自动检测对话是否属于某个项目
 * 仅建议，不自动创建
 *
 * @module utils/memory/episodeDetector
 */

const { EpisodeManager, EPISODE_STATUS } = require("./episodeManager");
const { getLLMProvider } = require("../helpers");

/**
 * Episode 检测配置
 */
const DETECTION_CONFIG = {
  /** 启用自动检测 */
  enabled: process.env.EPISODE_AUTO_DETECT !== "false",
  /** 最小对话轮数（低于此值不触发检测） */
  minMessageCount: 3,
  /** 检测间隔（每 N 条消息检测一次） */
  detectInterval: 5,
  /** 使用轻量级模型 */
  preferLightModel: true,
  /** 轻量级模型列表（按优先级） */
  lightModels: ["claude-3-haiku-20240307", "gpt-3.5-turbo", "deepseek-chat"],
};

/**
 * Episode 检测器
 */
const EpisodeDetector = {
  /**
   * 检测对话是否属于某个 Episode
   *
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.userMessage - 用户消息
   * @param {string} params.aiResponse - AI 响应
   * @param {number} params.threadId - Thread ID
   * @param {number} params.messageCount - 当前对话轮数
   * @returns {Promise<{belongsTo: string|null, suggestNew: string|null, confidence: number}>}
   */
  detectEpisode: async function ({
    workspaceId,
    userMessage,
    aiResponse,
    threadId,
    messageCount,
  }) {
    // 检查是否启用
    if (!DETECTION_CONFIG.enabled) {
      return { belongsTo: null, suggestNew: null, confidence: 0 };
    }

    // 检查消息数量
    if (messageCount < DETECTION_CONFIG.minMessageCount) {
      return { belongsTo: null, suggestNew: null, confidence: 0 };
    }

    // 检查检测间隔
    if (messageCount % DETECTION_CONFIG.detectInterval !== 0) {
      return { belongsTo: null, suggestNew: null, confidence: 0 };
    }

    try {
      // 获取活跃的 Episodes
      const activeEpisodes = await EpisodeManager.getEpisodes({
        workspaceId,
        status: EPISODE_STATUS.ACTIVE,
      });

      // 如果没有活跃项目，检查是否应该建议创建新项目
      if (activeEpisodes.length === 0) {
        return this._suggestNewEpisode(userMessage, aiResponse);
      }

      // 使用 LLM 分析
      const analysis = await this._analyzeWithLLM({
        userMessage,
        aiResponse,
        activeEpisodes,
      });

      return analysis;
    } catch (error) {
      console.error("[EpisodeDetector] Error detecting episode:", error);
      return { belongsTo: null, suggestNew: null, confidence: 0 };
    }
  },

  /**
   * 使用 LLM 分析对话归属
   * @private
   */
  _analyzeWithLLM: async function ({
    userMessage,
    aiResponse,
    activeEpisodes,
  }) {
    try {
      const provider = getLLMProvider({});

      const episodeList = activeEpisodes
        .map(
          (e) =>
            `- ID: ${e.id}, 名称: ${e.name}, 描述: ${e.description || "无"}`
        )
        .join("\n");

      const prompt = `你是一个项目分类助手。请分析以下对话内容，判断它是否属于某个已有项目。

当前活跃项目列表:
${episodeList}

用户消息: ${userMessage.slice(0, 300)}
AI回复: ${aiResponse.slice(0, 300)}

请以 JSON 格式返回分析结果:
{
  "belongs_to": "项目ID 或 null",
  "suggest_new": "如果是新项目，建议的项目名称，否则为 null",
  "confidence": 0.0-1.0 的置信度,
  "reason": "简短的判断理由"
}

只返回 JSON，不要有其他内容。`;

      const response = await provider.complete([
        { role: "user", content: prompt },
      ]);
      const text = response?.textResponse || response?.result || "{}";

      // 解析 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { belongsTo: null, suggestNew: null, confidence: 0 };
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        belongsTo: result.belongs_to || null,
        suggestNew: result.suggest_new || null,
        confidence: result.confidence || 0,
        reason: result.reason || null,
      };
    } catch (error) {
      console.error("[EpisodeDetector] LLM analysis failed:", error);
      return { belongsTo: null, suggestNew: null, confidence: 0 };
    }
  },

  /**
   * 基于规则建议新项目（无 LLM）
   * @private
   */
  _suggestNewEpisode: function (userMessage, aiResponse) {
    // 检测项目相关关键词
    const projectKeywords = [
      /(?:开发|实现|构建|创建|设计)(.{2,20}?)(?:项目|系统|功能|模块)/,
      /(?:关于|针对)(.{2,20}?)(?:的|项目)/,
      /(.{2,15}?)(?:开发计划|实施方案|技术方案)/,
    ];

    for (const pattern of projectKeywords) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const suggestNew = this._cleanSuggestedEpisodeName(match[1]);
        return {
          belongsTo: null,
          suggestNew,
          confidence: 0.6,
        };
      }
    }

    return { belongsTo: null, suggestNew: null, confidence: 0 };
  },

  _cleanSuggestedEpisodeName: function (name) {
    return String(name || "")
      .trim()
      .replace(/^(请|请帮我|帮我|帮忙|制定|做一个|创建一个)+/, "")
      .trim();
  },
};

module.exports = { EpisodeDetector, DETECTION_CONFIG };
