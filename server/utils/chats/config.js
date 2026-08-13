/**
 * 聊天系统配置常量
 *
 * 集中管理聊天相关的默认配置值
 *
 * @module chats/config
 */

/**
 * 默认历史消息数量
 *
 * Phase 0 改进：从 20 提升至 40
 * - 适用于大多数对话场景
 * - 支持更长的上下文记忆
 * - Workspace 可单独配置覆盖此值
 *
 * @type {number}
 */
const DEFAULT_MESSAGE_LIMIT = 40;

/**
 * 图谱上下文默认 Token 预算
 *
 * @type {number}
 */
const DEFAULT_GRAPH_TOKEN_BUDGET = 3000;

/**
 * 图谱搜索默认节点数限制
 *
 * @type {number}
 */
const DEFAULT_GRAPH_NODE_LIMIT = 50;

/**
 * 向量搜索默认返回数量
 *
 * @type {number}
 */
const DEFAULT_TOP_N = 4;

/**
 * 获取消息历史限制
 *
 * 优先级：Workspace 配置 > 系统默认值
 *
 * @param {Object} workspace - Workspace 对象
 * @returns {number} 消息历史限制数
 */
function getMessageLimit(workspace) {
  return workspace?.openAiHistory || DEFAULT_MESSAGE_LIMIT;
}

module.exports = {
  DEFAULT_MESSAGE_LIMIT,
  DEFAULT_GRAPH_TOKEN_BUDGET,
  DEFAULT_GRAPH_NODE_LIMIT,
  DEFAULT_TOP_N,
  getMessageLimit,
};
