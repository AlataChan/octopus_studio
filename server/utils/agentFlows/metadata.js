/**
 * Agent Flow Metadata 工具函数
 *
 * @description
 * 用于提取和处理 Agent Flow 执行结果中的元数据，
 * 特别是多 Agent 协作中的角色信息。
 */

/**
 * 从 Flow 执行结果中提取角色元数据
 *
 * @param {Object} flowResult - Flow 执行结果
 * @param {boolean} flowResult.success - 是否成功
 * @param {Array} flowResult.results - 步骤执行结果数组
 * @param {Object} flowResult.metadata - 元数据对象
 * @param {Array} flowResult.metadata.agentRoles - Agent 角色数组
 *
 * @returns {Object|null} 提取的元数据，如果没有则返回 null
 *
 * @example
 * const flowResult = await AgentFlows.executeFlow(uuid, variables, aibitat);
 * const metadata = extractAgentMetadata(flowResult);
 * // metadata = {
 * //   agentRoles: [
 * //     { role: "researcher", description: "...", flowId: "..." },
 * //     { role: "writer", description: "...", flowId: "..." }
 * //   ]
 * // }
 */
function extractAgentMetadata(flowResult) {
  if (!flowResult || !flowResult.metadata) {
    return null;
  }

  const { agentRoles } = flowResult.metadata;

  if (!agentRoles || agentRoles.length === 0) {
    return null;
  }

  return {
    agentRoles: agentRoles.map((role) => ({
      role: role.role,
      description: role.description || "",
      flowId: role.flowId || "",
    })),
  };
}

/**
 * 将 Agent 元数据附加到聊天响应对象
 *
 * @param {Object} response - 聊天响应对象
 * @param {string} response.text - 响应文本
 * @param {Array} response.sources - 来源数组
 * @param {string} response.type - 响应类型
 * @param {Object} flowResult - Flow 执行结果（可选）
 *
 * @returns {Object} 附加了 metadata 的响应对象
 *
 * @example
 * const response = {
 *   text: "...",
 *   sources: [],
 *   type: "chat"
 * };
 * const enrichedResponse = attachAgentMetadata(response, flowResult);
 * // enrichedResponse.metadata = { agentRoles: [...] }
 */
function attachAgentMetadata(response, flowResult = null) {
  if (!flowResult) {
    return response;
  }

  const metadata = extractAgentMetadata(flowResult);

  if (!metadata) {
    return response;
  }

  return {
    ...response,
    metadata,
  };
}

/**
 * 格式化角色信息为人类可读的字符串
 *
 * @param {Array} agentRoles - Agent 角色数组
 * @returns {string} 格式化的字符串
 *
 * @example
 * formatAgentRoles([
 *   { role: "researcher", description: "Collects information" },
 *   { role: "writer", description: "Writes content" }
 * ]);
 * // 返回: "researcher (Collects information), writer (Writes content)"
 */
function formatAgentRoles(agentRoles) {
  if (!agentRoles || agentRoles.length === 0) {
    return "";
  }

  return agentRoles
    .map((role) => {
      if (role.description) {
        return `${role.role} (${role.description})`;
      }
      return role.role;
    })
    .join(", ");
}

/**
 * 检查 Flow 执行结果是否包含多 Agent 协作
 *
 * @param {Object} flowResult - Flow 执行结果
 * @returns {boolean} 是否包含多 Agent 协作
 */
function hasMultiAgentCollaboration(flowResult) {
  if (!flowResult || !flowResult.metadata || !flowResult.metadata.agentRoles) {
    return false;
  }

  return flowResult.metadata.agentRoles.length > 0;
}

/**
 * 获取主要执行角色（第一个角色）
 *
 * @param {Object} flowResult - Flow 执行结果
 * @returns {Object|null} 主要角色信息，如果没有则返回 null
 */
function getPrimaryAgent(flowResult) {
  if (!hasMultiAgentCollaboration(flowResult)) {
    return null;
  }

  return flowResult.metadata.agentRoles[0];
}

module.exports = {
  extractAgentMetadata,
  attachAgentMetadata,
  formatAgentRoles,
  hasMultiAgentCollaboration,
  getPrimaryAgent,
};
