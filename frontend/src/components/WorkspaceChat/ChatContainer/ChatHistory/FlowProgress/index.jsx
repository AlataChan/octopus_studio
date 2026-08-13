import React from "react";
import {
  CircleNotch,
  CheckCircle,
  Play,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";

/**
 * FlowProgress 组件 - 轻量级 Flow 执行进度指示器
 *
 * @description 显示 Agent Flow 的执行进度，提供用户感知
 *
 * @param {Object} props
 * @param {Object} props.progress - 进度信息
 * @param {string} props.progress.flowName - Flow 名称
 * @param {number} props.progress.stepIndex - 当前步骤索引（从 1 开始）
 * @param {number} props.progress.totalSteps - 总步骤数
 * @param {string} props.progress.stepLabel - 步骤标签
 * @param {string} [props.progress.roleName] - 角色名称（可选，用于多角色协作显示）
 * @param {string} [props.progress.roleDescription] - 角色描述（可选）
 * @param {string} props.progress.status - 状态：running | completed | failed
 */
export default function FlowProgress({ progress }) {
  if (!progress) return null;

  const {
    flowName,
    stepIndex,
    totalSteps,
    stepLabel,
    roleName,
    roleDescription: _roleDescription,
    status,
  } = progress;
  const percentage = totalSteps > 0 ? (stepIndex / totalSteps) * 100 : 0;
  const isRunning = status === "running";
  const isFailed = status === "failed";

  // 角色名称映射（将英文 roleName 转换为中文显示）
  const roleNameMap = {
    // 长文写作流程
    outliner: "大纲师",
    writer: "撰写员",
    editor: "编辑员",
    // 市场调研流程
    researcher: "研究员",
    reviewer: "审核员",
    // 数据分析流程
    collector: "数据收集员",
    validator: "数据验证员",
    analyst: "分析师",
    anomaly_detector: "异常检测员",
    reporter: "报告员",
    // 项目管理流程
    requirement_analyst: "需求分析师",
    risk_manager: "风险管理师",
    planner: "规划师",
    evaluator: "评估师",
    consultant: "顾问",
    // 项目审核流程
    data_validator: "数据验证员",
    compliance_checker: "合规检查员",
    scorer: "评分员",
    quality_doctor: "质量诊断师",
    historian: "历史分析员",
    chief_reviewer: "首席审核员",
  };

  const displayRoleName = roleName ? roleNameMap[roleName] || roleName : null;

  return (
    <div className="flex justify-center w-full my-2">
      <div className="w-full max-w-[80%]">
        <div
          className="bg-theme-bg-chat-input rounded-lg px-4 py-3 border border-theme-sidebar-border/30"
          style={{ borderRadius: "8px" }}
        >
          {/* 顶部：Flow 名称和进度 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {isFailed ? (
                <WarningCircle
                  className="w-4 h-4 text-amber-400"
                  weight="fill"
                />
              ) : isRunning ? (
                <CircleNotch
                  className="w-4 h-4 text-blue-400 animate-spin"
                  weight="bold"
                />
              ) : (
                <CheckCircle className="w-4 h-4 text-green-400" weight="fill" />
              )}
              <span className="text-sm font-medium text-theme-text-primary">
                {flowName || "执行流程"}
              </span>
            </div>
            <span className="text-xs text-theme-text-secondary font-mono">
              {stepIndex}/{totalSteps}
            </span>
          </div>

          {/* 进度条 */}
          <div className="w-full h-1.5 bg-theme-sidebar-border/30 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                isFailed
                  ? "bg-amber-500"
                  : isRunning
                    ? "bg-blue-500"
                    : "bg-green-500"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* 当前步骤标签和角色信息 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Play
                className="w-3 h-3 text-theme-text-secondary"
                weight="fill"
              />
              <span className="text-xs text-theme-text-secondary">
                {stepLabel || "处理中..."}
              </span>
            </div>
            {/* 角色标签 */}
            {displayRoleName && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/10 rounded-full">
                <UserCircle className="w-3 h-3 text-purple-400" weight="fill" />
                <span className="text-xs text-purple-400 font-medium">
                  {displayRoleName}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
