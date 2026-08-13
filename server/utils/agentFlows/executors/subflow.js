// 延迟加载以避免循环依赖
let AgentFlows = null;
function getAgentFlows() {
  if (!AgentFlows) {
    AgentFlows = require("../index").AgentFlows;
  }
  return AgentFlows;
}

/**
 * 执行 Subflow 步骤
 *
 * @description
 * Subflow 允许一个 Flow 调用另一个 Flow 作为子流程，实现多 Agent 协作。
 * 每个 Subflow 可以有自己的角色（role），并通过 Blackboard 共享数据。
 *
 * @param {Object} config - Subflow 配置
 * @param {string} config.flowId - 子 Flow 的 ID
 * @param {string} config.roleName - 角色名称（如 "researcher"）
 * @param {string} config.roleDescription - 角色描述
 * @param {Object} config.inputMapping - 输入映射 { blackboardKey: flowVariableKey }
 * @param {string} config.outputKey - 输出存储到 blackboard 的 key
 * @param {number} [config.timeout=300] - 超时时间（秒）
 * @param {string} [config.onError='fail'] - 错误处理策略: 'fail', 'continue', 'retry'
 *
 * @param {Object} context - 执行上下文
 * @param {Function} context.introspect - 日志函数
 * @param {Function} context.logger - 日志函数
 * @param {Object} context.aibitat - AI 执行器
 * @param {Object} context.blackboard - 共享上下文（Blackboard 实例）
 *
 * @returns {Promise<Object>} 执行结果
 * @returns {boolean} result.success - 是否成功
 * @returns {*} result.data - 子 Flow 的输出数据
 * @returns {string} result.error - 错误信息（如果失败）
 * @returns {Object} result.metadata - 元数据（角色信息等）
 */
async function executeSubflow(config, context) {
  const {
    flowId,
    roleName,
    roleDescription,
    inputMapping = {},
    outputKey,
    timeout = 300,
    onError = "fail",
  } = config;

  const { introspect, logger, aibitat, blackboard } = context;

  introspect(`[Subflow] Executing sub-flow: ${flowId} as role: ${roleName}`);

  // 验证必需参数
  if (!flowId) {
    const error = "Subflow execution failed: flowId is required";
    logger(error);
    return {
      success: false,
      error,
      metadata: { roleName, roleDescription },
    };
  }

  if (!outputKey) {
    const error = "Subflow execution failed: outputKey is required";
    logger(error);
    return {
      success: false,
      error,
      metadata: { roleName, roleDescription },
    };
  }

  try {
    // 1. 准备输入变量（从 blackboard 映射）
    const inputVariables = {};
    if (blackboard && typeof inputMapping === "object") {
      for (const [flowVar, blackboardKey] of Object.entries(inputMapping)) {
        const value = blackboard.get(blackboardKey);
        if (value !== null && value !== undefined) {
          inputVariables[flowVar] = value;
          introspect(
            `[Subflow] Mapped ${blackboardKey} -> ${flowVar}: ${typeof value}`
          );
        }
      }
    }

    // 2. 加载子 Flow
    const flows = getAgentFlows();
    const subFlow = flows.loadFlow(flowId);
    if (!subFlow) {
      throw new Error(`Sub-flow not found: ${flowId}`);
    }

    introspect(`[Subflow] Loaded sub-flow: ${subFlow.name || flowId}`);

    // 3. 执行子 Flow（带超时控制）
    const executionPromise = flows.executeFlow(flowId, inputVariables, aibitat);

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Subflow execution timeout after ${timeout}s`)),
        timeout * 1000
      );
    });

    let result;
    try {
      result = await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }

    introspect(`[Subflow] Execution completed for role: ${roleName}`);

    // 4. 存储输出到 blackboard
    if (blackboard && outputKey) {
      blackboard.set(outputKey, result, {
        role: roleName,
        roleDescription,
        flowId,
        timestamp: new Date().toISOString(),
      });
      introspect(`[Subflow] Stored output to blackboard: ${outputKey}`);
    }

    // 5. 返回成功结果
    return {
      success: true,
      data: result,
      metadata: {
        roleName,
        roleDescription,
        flowId,
        outputKey,
      },
    };
  } catch (error) {
    logger(`[Subflow] Error executing sub-flow ${flowId}: ${error.message}`);

    // 错误处理策略
    if (onError === "retry") {
      introspect(`[Subflow] Retrying sub-flow execution...`);
      try {
        const flows = getAgentFlows();
        const retryResult = await flows.executeFlow(flowId, {}, aibitat);
        if (blackboard && outputKey) {
          blackboard.set(outputKey, retryResult, {
            role: roleName,
            roleDescription,
            flowId,
            timestamp: new Date().toISOString(),
            retried: true,
          });
        }
        return {
          success: true,
          data: retryResult,
          metadata: { roleName, roleDescription, flowId, retried: true },
        };
      } catch (_retryError) {
        // 重试失败，继续执行原错误处理逻辑
      }
    }

    if (onError === "continue") {
      introspect(`[Subflow] Continuing despite error (onError=continue)`);
      return {
        success: false,
        error: error.message,
        metadata: { roleName, roleDescription, flowId },
        continued: true,
      };
    }

    // 默认: fail - 抛出错误
    throw error;
  }
}

module.exports = executeSubflow;
