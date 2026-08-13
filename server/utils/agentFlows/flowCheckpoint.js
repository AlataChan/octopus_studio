/**
 * Flow Checkpoint Manager
 *
 * Phase I: Flow 错误恢复 - 检查点管理
 *
 * 提供 Flow 执行的检查点保存和恢复功能：
 * - 保存执行状态到检查点
 * - 从检查点恢复执行
 * - 管理检查点生命周期
 */

const { v4: uuidv4 } = require("uuid");

// 内存存储检查点（生产环境应使用持久化存储）
const checkpoints = new Map();

// 检查点过期时间（30分钟）
const CHECKPOINT_TTL = 30 * 60 * 1000;

class FlowCheckpointManager {
  /**
   * 创建检查点
   * @param {Object} state - Flow 执行状态
   * @param {string} state.flowId - Flow ID
   * @param {string} state.flowName - Flow 名称
   * @param {number} state.stepIndex - 当前步骤索引
   * @param {Object} state.variables - 当前变量状态
   * @param {Array} state.results - 已执行步骤的结果
   * @param {Object} state.blackboardState - Blackboard 状态
   * @param {Object} state.failedStep - 失败的步骤信息
   * @returns {string} 检查点 ID
   */
  static createCheckpoint(state) {
    const checkpointId = uuidv4();
    const checkpoint = {
      id: checkpointId,
      createdAt: Date.now(),
      expiresAt: Date.now() + CHECKPOINT_TTL,
      state: {
        flowId: state.flowId,
        flowName: state.flowName,
        stepIndex: state.stepIndex,
        variables: { ...state.variables },
        results: [...(state.results || [])],
        blackboardState: state.blackboardState
          ? JSON.parse(JSON.stringify(state.blackboardState))
          : null,
        failedStep: state.failedStep,
      },
    };

    checkpoints.set(checkpointId, checkpoint);
    console.log(
      `[FlowCheckpoint] Created checkpoint ${checkpointId} at step ${state.stepIndex}`
    );

    // 清理过期检查点
    this.cleanupExpired();

    return checkpointId;
  }

  /**
   * 获取检查点
   * @param {string} checkpointId - 检查点 ID
   * @returns {Object|null} 检查点数据
   */
  static getCheckpoint(checkpointId) {
    const checkpoint = checkpoints.get(checkpointId);
    if (!checkpoint) {
      console.log(`[FlowCheckpoint] Checkpoint ${checkpointId} not found`);
      return null;
    }

    if (Date.now() > checkpoint.expiresAt) {
      console.log(`[FlowCheckpoint] Checkpoint ${checkpointId} expired`);
      checkpoints.delete(checkpointId);
      return null;
    }

    return checkpoint;
  }

  /**
   * 删除检查点
   * @param {string} checkpointId - 检查点 ID
   */
  static deleteCheckpoint(checkpointId) {
    checkpoints.delete(checkpointId);
    console.log(`[FlowCheckpoint] Deleted checkpoint ${checkpointId}`);
  }

  /**
   * 清理过期检查点
   */
  static cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, checkpoint] of checkpoints.entries()) {
      if (now > checkpoint.expiresAt) {
        checkpoints.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[FlowCheckpoint] Cleaned up ${cleaned} expired checkpoints`);
    }
  }

  /**
   * 获取所有活跃检查点（用于调试）
   * @returns {Array} 检查点列表
   */
  static getAllActive() {
    const now = Date.now();
    const active = [];
    for (const [id, checkpoint] of checkpoints.entries()) {
      if (now <= checkpoint.expiresAt) {
        active.push({
          id,
          flowName: checkpoint.state.flowName,
          stepIndex: checkpoint.state.stepIndex,
          createdAt: checkpoint.createdAt,
          expiresIn: Math.round((checkpoint.expiresAt - now) / 1000),
        });
      }
    }
    return active;
  }
}

/**
 * 等待用户对 Flow 失败的响应
 * @param {Object} socket - WebSocket 连接
 * @param {Object} failureInfo - 失败信息
 * @param {string} checkpointId - 检查点 ID
 * @returns {Promise<string>} 用户选择：'retry' | 'skip' | 'abort'
 */
async function waitForUserResponse(socket, failureInfo, checkpointId) {
  return new Promise((resolve) => {
    // 设置超时（5分钟无响应自动跳过）
    const timeout = setTimeout(
      () => {
        console.log(
          `[FlowCheckpoint] User response timeout for ${checkpointId}, auto-skipping`
        );
        resolve("skip");
      },
      5 * 60 * 1000
    );

    // 注册响应处理器
    const responseHandler = (choice) => {
      clearTimeout(timeout);
      resolve(choice);
    };

    // 发送失败对话框消息给前端
    if (socket?.send) {
      socket.send(
        JSON.stringify({
          type: "flowFailureDialog",
          data: {
            ...failureInfo,
            checkpointId,
            timestamp: Date.now(),
          },
        })
      );
    }

    // 存储响应处理器（通过 WebSocket 消息触发）
    if (!global.__flowFailureResponders) {
      global.__flowFailureResponders = new Map();
    }
    global.__flowFailureResponders.set(checkpointId, responseHandler);
  });
}

/**
 * 处理用户对 Flow 失败的响应
 * @param {string} checkpointId - 检查点 ID
 * @param {string} choice - 用户选择
 */
function handleUserResponse(checkpointId, choice) {
  const handler = global.__flowFailureResponders?.get(checkpointId);
  if (handler) {
    handler(choice);
    global.__flowFailureResponders.delete(checkpointId);
  }
}

module.exports = {
  FlowCheckpointManager,
  waitForUserResponse,
  handleUserResponse,
};
