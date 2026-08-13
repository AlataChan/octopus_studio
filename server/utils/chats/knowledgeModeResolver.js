const { WorkspaceAssistant } = require("../../models/workspaceAssistant");

/**
 * 解析助手的有效知识模式
 *
 * 优先级：实例覆盖 > 模板默认 > 系统默认(workspace)
 *
 * @param {string|null} assistantId - 助手实例 ID（workspace_assistants.id）
 * @param {number} workspaceId - Workspace ID（用于验证助手归属）
 * @returns {Promise<{mode: "workspace"|"platform"|"none", template: Object|null, instance: Object|null}>}
 */
async function resolveKnowledgeMode(assistantId, workspaceId) {
  const DEFAULT_MODE = "workspace";
  const VALID_MODES = ["workspace", "platform", "none"];

  // 如果没有指定助手，使用默认模式
  if (!assistantId) {
    return { mode: DEFAULT_MODE, template: null, instance: null };
  }

  try {
    // 1. 加载助手实例（WorkspaceAssistant.get 会自动 include template 和 workspace）
    const instance = await WorkspaceAssistant.get(assistantId);

    if (!instance) {
      console.warn(
        `[KnowledgeMode] Assistant instance ${assistantId} not found`
      );
      return { mode: DEFAULT_MODE, template: null, instance: null };
    }

    // 2. 验证助手归属（安全检查）
    if (instance.workspaceId !== workspaceId) {
      console.warn(
        `[KnowledgeMode] Assistant ${assistantId} does not belong to workspace ${workspaceId}, using default mode`
      );
      return { mode: DEFAULT_MODE, template: null, instance: null };
    }

    // 3. 检查助手是否启用
    if (!instance.enabled) {
      console.warn(
        `[KnowledgeMode] Assistant ${assistantId} is disabled, using default mode`
      );
      return { mode: DEFAULT_MODE, template: instance.template, instance };
    }

    const template = instance.template;

    if (!template) {
      console.warn(
        `[KnowledgeMode] Template for assistant ${assistantId} not found`
      );
      return { mode: DEFAULT_MODE, template: null, instance };
    }

    // 4. 按优先级合并：实例覆盖 > 模板默认 > 系统默认
    let effectiveMode = DEFAULT_MODE;

    if (instance.knowledgeModeOverride) {
      effectiveMode = instance.knowledgeModeOverride;
      console.log(`[KnowledgeMode] Using instance override: ${effectiveMode}`);
    } else if (template.knowledgeModeTemplate) {
      effectiveMode = template.knowledgeModeTemplate;
      console.log(`[KnowledgeMode] Using template default: ${effectiveMode}`);
    } else {
      console.log(`[KnowledgeMode] Using system default: ${effectiveMode}`);
    }

    // 5. 校验模式合法性
    if (!VALID_MODES.includes(effectiveMode)) {
      console.error(
        `[KnowledgeMode] Invalid mode "${effectiveMode}" for assistant ${assistantId}, fallback to default`
      );
      effectiveMode = DEFAULT_MODE;
    }

    // 6. 边界条件检查：platform 模式必须有 platformType 和 platformConfig
    if (effectiveMode === "platform") {
      if (!template.platformType || template.platformType === "internal") {
        console.error(
          `[KnowledgeMode] Assistant ${assistantId} is set to "platform" mode but platformType is "${template.platformType}", fallback to workspace`
        );
        effectiveMode = "workspace";
      } else if (!template.platformConfig) {
        console.error(
          `[KnowledgeMode] Assistant ${assistantId} is set to "platform" mode but platformConfig is missing, fallback to workspace`
        );
        effectiveMode = "workspace";
      }
    }

    return { mode: effectiveMode, template, instance };
  } catch (error) {
    console.error("[KnowledgeMode] Resolution error:", error);
    return { mode: DEFAULT_MODE, template: null, instance: null };
  }
}

module.exports = { resolveKnowledgeMode };
