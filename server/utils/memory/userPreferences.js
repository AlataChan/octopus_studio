/**
 * 用户偏好管理器
 *
 * Phase 1 任务 2: 用户偏好 (3字段)
 * 使用 user.metadata 存储极简偏好
 *
 * @module utils/memory/userPreferences
 */

const prisma = require("../prisma");
const { safeJsonParse } = require("../http");

/**
 * 偏好字段定义
 */
const PREFERENCE_FIELDS = {
  /** 语言偏好 */
  language: {
    key: "language",
    default: "auto",
    options: ["auto", "zh-CN", "zh-TW", "en", "ja", "ko"],
    description: "响应语言偏好",
  },
  /** 解释深度 */
  explanation_depth: {
    key: "explanation_depth",
    default: "balanced",
    options: ["concise", "balanced", "detailed"],
    description: "解释详细程度",
  },
  /** 代码风格 */
  code_style: {
    key: "code_style",
    default: "standard",
    options: ["minimal", "standard", "verbose"],
    description: "代码注释和文档风格",
  },
};

/**
 * 默认偏好配置
 */
const DEFAULT_PREFERENCES = {
  language: PREFERENCE_FIELDS.language.default,
  explanation_depth: PREFERENCE_FIELDS.explanation_depth.default,
  code_style: PREFERENCE_FIELDS.code_style.default,
};

/**
 * 用户偏好管理器
 */
const UserPreferences = {
  /**
   * 获取用户偏好
   *
   * @param {number} userId - 用户 ID
   * @returns {Promise<Object>} 用户偏好对象
   */
  getPreferences: async function (userId) {
    try {
      if (!userId) {
        return { ...DEFAULT_PREFERENCES };
      }

      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { metadata: true },
      });

      if (!user || !user.metadata) {
        return { ...DEFAULT_PREFERENCES };
      }

      const metadata = safeJsonParse(user.metadata, {});
      const preferences = metadata.preferences || {};

      // 合并默认值，确保所有字段都存在
      return {
        language: preferences.language || DEFAULT_PREFERENCES.language,
        explanation_depth:
          preferences.explanation_depth ||
          DEFAULT_PREFERENCES.explanation_depth,
        code_style: preferences.code_style || DEFAULT_PREFERENCES.code_style,
      };
    } catch (error) {
      console.error("[UserPreferences] Error getting preferences:", error);
      return { ...DEFAULT_PREFERENCES };
    }
  },

  /**
   * 更新用户偏好
   *
   * @param {number} userId - 用户 ID
   * @param {Object} updates - 要更新的偏好字段
   * @returns {Promise<Object>} 更新后的偏好对象
   */
  updatePreferences: async function (userId, updates) {
    try {
      if (!userId) {
        throw new Error("User ID is required");
      }

      // 验证更新字段
      const validUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        if (PREFERENCE_FIELDS[key]) {
          const field = PREFERENCE_FIELDS[key];
          if (field.options.includes(value)) {
            validUpdates[key] = value;
          } else {
            console.warn(
              `[UserPreferences] Invalid value "${value}" for field "${key}"`
            );
          }
        }
      }

      // 获取现有 metadata
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { metadata: true },
      });

      const existingMetadata = safeJsonParse(user?.metadata, {});
      const existingPreferences = existingMetadata.preferences || {};

      // 合并偏好
      const newPreferences = {
        ...DEFAULT_PREFERENCES,
        ...existingPreferences,
        ...validUpdates,
      };

      // 更新 metadata
      const newMetadata = {
        ...existingMetadata,
        preferences: newPreferences,
        preferencesUpdatedAt: new Date().toISOString(),
      };

      await prisma.users.update({
        where: { id: userId },
        data: {
          metadata: JSON.stringify(newMetadata),
          lastUpdatedAt: new Date(),
        },
      });

      console.log(`[UserPreferences] Updated preferences for user ${userId}`);
      return newPreferences;
    } catch (error) {
      console.error("[UserPreferences] Error updating preferences:", error);
      throw error;
    }
  },

  /**
   * 获取偏好字段定义（用于前端展示）
   *
   * @returns {Object} 偏好字段定义
   */
  getFieldDefinitions: function () {
    return PREFERENCE_FIELDS;
  },

  /**
   * 生成偏好提示词片段
   * 用于注入到 System Prompt 中
   *
   * @param {number} userId - 用户 ID
   * @returns {Promise<string>} 偏好提示词
   */
  generatePreferencePrompt: async function (userId) {
    try {
      const prefs = await this.getPreferences(userId);

      const parts = [];

      // 语言偏好
      if (prefs.language !== "auto") {
        const langMap = {
          "zh-CN": "简体中文",
          "zh-TW": "繁體中文",
          en: "English",
          ja: "日本語",
          ko: "한국어",
        };
        parts.push(`请使用${langMap[prefs.language] || prefs.language}回复。`);
      }

      // 解释深度
      const depthMap = {
        concise: "请保持回复简洁，直接给出答案。",
        balanced: "", // 默认不添加
        detailed: "请提供详细的解释和背景信息。",
      };
      if (depthMap[prefs.explanation_depth]) {
        parts.push(depthMap[prefs.explanation_depth]);
      }

      // 代码风格
      const styleMap = {
        minimal: "代码示例请保持最简，省略注释。",
        standard: "", // 默认不添加
        verbose: "代码示例请包含详细注释和文档字符串。",
      };
      if (styleMap[prefs.code_style]) {
        parts.push(styleMap[prefs.code_style]);
      }

      if (parts.length === 0) {
        return "";
      }

      return `\n\n[用户偏好]\n${parts.join("\n")}`;
    } catch (error) {
      console.error("[UserPreferences] Error generating prompt:", error);
      return "";
    }
  },

  /**
   * 重置用户偏好为默认值
   *
   * @param {number} userId - 用户 ID
   * @returns {Promise<Object>} 重置后的偏好
   */
  resetPreferences: async function (userId) {
    return this.updatePreferences(userId, DEFAULT_PREFERENCES);
  },
};

module.exports = {
  UserPreferences,
  PREFERENCE_FIELDS,
  DEFAULT_PREFERENCES,
};
