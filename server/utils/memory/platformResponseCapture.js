const {
  WorkspaceAgentInvocation,
} = require("../../models/workspaceAgentInvocation");
const { safeJsonParse } = require("../http");

/**
 * 外部平台响应捕获器
 *
 * 从外部平台（Dify/RAGFlow/n8n）的响应中提取元数据
 * 用于可观测性和质量分析
 */
class PlatformResponseCapture {
  /**
   * 捕获并存储外部平台响应元数据
   * @param {Object} params
   * @param {string} params.platform - 平台类型 (dify|ragflow|n8n)
   * @param {Object} params.response - 原始响应
   * @param {number} params.latencyMs - 响应延迟（毫秒）
   * @param {string} params.invocationId - Agent 调用 ID
   * @param {boolean} params.graphContextInjected - 是否注入了图谱上下文
   * @param {number} params.graphContextTokens - 图谱上下文 token 数
   * @returns {Promise<Object>} 提取的元数据
   */
  static async capture({
    platform,
    response,
    latencyMs,
    invocationId,
    graphContextInjected = false,
    graphContextTokens = 0,
  }) {
    const metadata = {
      external_platform: platform,
      external_latency_ms: latencyMs,
      graph_context_injected: graphContextInjected,
      graph_context_tokens: graphContextTokens,
      captured_at: new Date().toISOString(),
    };

    // 按平台提取特定字段
    switch (platform) {
      case "dify":
        metadata.external_session_id = response?.conversation_id;
        metadata.external_message_id = response?.message_id;
        metadata.tokens_used = response?.metadata?.usage?.total_tokens;
        metadata.retriever_resources = this.extractRetrieverResources(response);
        break;

      case "ragflow":
        metadata.external_session_id = response?.session_id;
        metadata.reference = response?.reference;
        metadata.chunks_used = response?.reference?.chunks?.length || 0;
        break;

      case "n8n":
        metadata.workflow_id = response?.workflowId;
        metadata.execution_id = response?.executionId;
        break;

      default:
        // 内部平台或未知平台
        break;
    }

    // 更新 WorkspaceAgentInvocation
    if (invocationId) {
      try {
        await WorkspaceAgentInvocation.updateMetadata(invocationId, {
          platform_response: metadata,
        });
        console.log(
          `[PlatformResponseCapture] Captured metadata for invocation ${invocationId}`
        );
      } catch (error) {
        console.error(
          "[PlatformResponseCapture] Failed to update invocation:",
          error
        );
      }
    }

    return metadata;
  }

  /**
   * 从 Dify 响应中提取检索资源信息
   */
  static extractRetrieverResources(response) {
    const resources = response?.metadata?.retriever_resources;
    if (!resources || !Array.isArray(resources)) return null;

    return resources.map((r) => ({
      document_id: r.document_id,
      document_name: r.document_name,
      segment_id: r.segment_id,
      score: r.score,
      content_preview: r.content?.substring(0, 100),
    }));
  }

  /**
   * 计算平台调用延迟
   * @param {number} startTime - 开始时间戳
   * @returns {number} 延迟毫秒数
   */
  static calculateLatency(startTime) {
    return Date.now() - startTime;
  }
}

module.exports = { PlatformResponseCapture };
