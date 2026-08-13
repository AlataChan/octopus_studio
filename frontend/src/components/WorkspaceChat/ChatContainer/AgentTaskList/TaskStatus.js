/**
 * TaskStatus - 任务状态枚举和工具函数
 *
 * Phase Task List: 定义完整的任务状态枚举
 */

/**
 * 任务状态枚举
 */
export const TaskStatus = {
  PENDING: "pending", // 待执行
  RUNNING: "running", // 执行中
  SUCCESS: "success", // 成功
  ERROR: "error", // 失败
  AWAITING_CONFIRMATION: "awaiting_confirmation", // 等待用户确认（PPT HITL）
  RETRYING: "retrying", // 自动重试中（PPT Schema 校验）
  DEGRADED: "degraded", // 已降级执行（PPT 降级策略）
  SKIPPED: "skipped", // 已跳过
  ABORTED: "aborted", // 用户主动取消或会话中断
  TIMEOUT: "timeout", // 超时
};

/**
 * 任务类型枚举
 */
export const TaskType = {
  FLOW: "flow", // Flow 执行
  TOOL: "tool", // 工具调用
  CONFIRMATION: "confirmation", // 用户确认点
  DIRECT: "direct", // 直接回复
};

/**
 * 状态是否为终态（不会再变化）
 * @param {string} status - 任务状态
 * @returns {boolean}
 */
export function isTerminalStatus(status) {
  return [
    TaskStatus.SUCCESS,
    TaskStatus.ERROR,
    TaskStatus.DEGRADED,
    TaskStatus.SKIPPED,
    TaskStatus.ABORTED,
    TaskStatus.TIMEOUT,
  ].includes(status);
}

/**
 * 状态是否为需要用户操作
 * @param {string} status - 任务状态
 * @returns {boolean}
 */
export function requiresUserAction(status) {
  return status === TaskStatus.AWAITING_CONFIRMATION;
}

/**
 * 从工具执行阶段映射到任务状态
 * @param {string} stage - 工具执行阶段: "start" | "progress" | "success" | "error"
 * @returns {string} TaskStatus
 */
export function mapToolStageToTaskStatus(stage) {
  switch (stage) {
    case "start":
    case "progress":
      return TaskStatus.RUNNING;
    case "success":
      return TaskStatus.SUCCESS;
    case "error":
      return TaskStatus.ERROR;
    default:
      return TaskStatus.PENDING;
  }
}

/**
 * 获取状态的优先级（用于排序）
 * 数字越小优先级越高（显示在前面）
 * @param {string} status - 任务状态
 * @returns {number}
 */
export function getStatusPriority(status) {
  const priorities = {
    [TaskStatus.AWAITING_CONFIRMATION]: 1, // 需要用户操作的最优先
    [TaskStatus.RUNNING]: 2,
    [TaskStatus.RETRYING]: 3,
    [TaskStatus.PENDING]: 4,
    [TaskStatus.SUCCESS]: 5,
    [TaskStatus.DEGRADED]: 6,
    [TaskStatus.ERROR]: 7,
    [TaskStatus.TIMEOUT]: 8,
    [TaskStatus.ABORTED]: 9,
    [TaskStatus.SKIPPED]: 10,
  };
  return priorities[status] ?? 99;
}
