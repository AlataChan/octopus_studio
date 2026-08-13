/**
 * StatusIcon - 任务状态图标组件
 *
 * Phase Task List: 状态图标映射（含 A11y 支持）
 */

import {
  Circle,
  CircleNotch,
  CheckCircle,
  XCircle,
  Pause,
  ArrowClockwise,
  Warning,
  Prohibit,
  Timer,
  SkipForward,
} from "@phosphor-icons/react";
import { TaskStatus } from "./TaskStatus";

/**
 * 状态配置映射
 */
const STATUS_CONFIG = {
  [TaskStatus.PENDING]: {
    icon: Circle,
    color: "text-theme-text-secondary",
    bgColor: "bg-theme-bg-secondary",
    label: "待执行",
    animate: false,
  },
  [TaskStatus.RUNNING]: {
    icon: CircleNotch,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    label: "执行中",
    animate: true,
  },
  [TaskStatus.SUCCESS]: {
    icon: CheckCircle,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    label: "已完成",
    animate: false,
  },
  [TaskStatus.ERROR]: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    label: "失败",
    animate: false,
  },
  [TaskStatus.AWAITING_CONFIRMATION]: {
    icon: Pause,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    label: "等待确认",
    animate: false,
  },
  [TaskStatus.RETRYING]: {
    icon: ArrowClockwise,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    label: "重试中",
    animate: true,
  },
  [TaskStatus.DEGRADED]: {
    icon: Warning,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    label: "已降级",
    animate: false,
  },
  [TaskStatus.SKIPPED]: {
    icon: SkipForward,
    color: "text-theme-text-secondary",
    bgColor: "bg-theme-bg-secondary",
    label: "已跳过",
    animate: false,
  },
  [TaskStatus.ABORTED]: {
    icon: Prohibit,
    color: "text-theme-text-secondary",
    bgColor: "bg-theme-bg-secondary",
    label: "已取消",
    animate: false,
  },
  [TaskStatus.TIMEOUT]: {
    icon: Timer,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    label: "已超时",
    animate: false,
  },
};

/**
 * 状态图标组件
 * @param {Object} props
 * @param {string} props.status - 任务状态
 * @param {number} props.size - 图标大小
 * @param {boolean} props.showBackground - 是否显示背景
 */
export default function StatusIcon({
  status,
  size = 18,
  showBackground = false,
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[TaskStatus.PENDING];
  const Icon = config.icon;

  const iconElement = (
    <Icon
      size={size}
      weight={status === TaskStatus.PENDING ? "regular" : "fill"}
      className={`${config.color} ${config.animate ? "animate-spin" : ""}`}
      aria-label={config.label}
      title={config.label}
    />
  );

  if (showBackground) {
    return (
      <div
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${config.bgColor}`}
        role="status"
        aria-live="polite"
      >
        {iconElement}
      </div>
    );
  }

  return iconElement;
}

/**
 * 获取状态标签文本
 * @param {string} status - 任务状态
 * @returns {string}
 */
export function getStatusLabel(status) {
  return STATUS_CONFIG[status]?.label || "未知";
}

/**
 * 获取状态颜色类名
 * @param {string} status - 任务状态
 * @returns {string}
 */
export function getStatusColor(status) {
  return STATUS_CONFIG[status]?.color || "text-gray-400";
}

/**
 * 获取状态背景颜色类名
 * @param {string} status - 任务状态
 * @returns {string}
 */
export function getStatusBgColor(status) {
  return STATUS_CONFIG[status]?.bgColor || "bg-theme-bg-secondary";
}
