import React from "react";

/**
 * 员工身份标识组件
 *
 * 统一展示 AI 员工的三重身份：
 * - functionalName (name): 功能名称，如"长文协作助手"
 * - personaName (employeeName): 人格名称，如"露娜 Luna"
 * - positionTitle (employeeTitle): 岗位名称，如"首席营销官 CMO"
 *
 * 根据 Sam 的设计建议：
 * - 人才市场：主=功能名，辅=岗位（chip/角标）
 * - 团队页面：主=岗位，辅=功能名（小一号/灰阶）
 * - 两处都保证"能在 1 秒内看到另一个名字"
 *
 * @param {Object} props
 * @param {Object} props.employee - 员工数据对象
 * @param {string} props.employee.name - 功能名称（如"长文协作助手"）
 * @param {string} props.employee.employeeName - 人格名称（如"露娜 Luna"）
 * @param {string} props.employee.employeeTitle - 岗位名称（如"CMO"）
 * @param {string} props.employee.instanceName - 自定义实例名称（可选覆盖）
 * @param {string} props.context - 显示上下文: "marketplace" | "team" | "detail"
 * @param {string} props.size - 尺寸: "sm" | "md" | "lg"
 * @param {boolean} props.showAllFields - 是否强制显示所有字段
 * @param {string} props.className - 额外的样式类
 */
export default function EmployeeIdentity({
  employee,
  context = "marketplace",
  size = "md",
  showAllFields = false,
  className = "",
}) {
  if (!employee) return null;

  // 字段映射
  const functionalName = employee.name; // 功能名称
  const personaName = employee.employeeName; // 人格名称
  const positionTitle = employee.employeeTitle; // 岗位名称
  const instanceName = employee.instanceName; // 自定义名称（实例级）

  // 确定主显示名和辅助信息
  const getDisplayInfo = () => {
    // 如果有自定义实例名，优先使用
    if (instanceName) {
      return {
        primary: instanceName,
        secondary: functionalName || personaName,
        badge: positionTitle,
        tooltip: `${personaName} · ${functionalName}`,
      };
    }

    switch (context) {
      case "marketplace":
        // 人才市场：主=功能名，辅=岗位（chip）
        return {
          primary: functionalName || personaName,
          secondary: personaName !== functionalName ? personaName : null,
          badge: positionTitle,
          tooltip: `${personaName} · ${positionTitle}`,
        };

      case "team":
        // 团队页面：主=岗位/功能名，辅=功能名（灰阶）
        return {
          primary: positionTitle || functionalName,
          secondary: functionalName,
          badge: null,
          tooltip: `${personaName} · ${functionalName}`,
        };

      case "detail":
        // 详情页：显示完整信息
        return {
          primary: personaName || functionalName,
          secondary: functionalName,
          badge: positionTitle,
          tooltip: null,
        };

      default:
        return {
          primary: functionalName || personaName || "未命名员工",
          secondary: null,
          badge: positionTitle,
          tooltip: null,
        };
    }
  };

  const { primary, secondary, badge, tooltip } = getDisplayInfo();

  // 尺寸样式映射
  const sizeStyles = {
    sm: {
      primary: "text-sm font-medium",
      secondary: "text-xs",
      badge: "text-[10px] px-1.5 py-0.5",
    },
    md: {
      primary: "text-base font-semibold",
      secondary: "text-sm",
      badge: "text-xs px-2 py-0.5",
    },
    lg: {
      primary: "text-lg font-bold",
      secondary: "text-sm",
      badge: "text-xs px-2 py-1",
    },
  };

  const styles = sizeStyles[size] || sizeStyles.md;

  return (
    <div className={`flex flex-col ${className}`} title={tooltip || undefined}>
      {/* 主显示名 + 岗位徽章 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-theme-text-primary truncate ${styles.primary}`}>
          {primary}
        </span>

        {/* 岗位徽章 */}
        {badge && (
          <span
            className={`bg-theme-accent-primary/15 text-theme-accent-primary rounded-md font-medium whitespace-nowrap ${styles.badge}`}
          >
            {badge}
          </span>
        )}
      </div>

      {/* 辅助信息（功能名/人格名） */}
      {(secondary || showAllFields) && secondary !== primary && (
        <span
          className={`text-theme-text-secondary truncate mt-0.5 ${styles.secondary}`}
        >
          {secondary}
        </span>
      )}
    </div>
  );
}

/**
 * 紧凑版员工身份标识（用于列表/小卡片）
 */
export function EmployeeIdentityCompact({ employee, context = "marketplace" }) {
  if (!employee) return null;

  const functionalName = employee.name;
  const positionTitle = employee.employeeTitle;

  // 紧凑模式：功能名 · 岗位
  const displayText =
    context === "marketplace"
      ? functionalName
      : positionTitle || functionalName;

  const secondaryText =
    context === "marketplace" ? positionTitle : functionalName;

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="text-theme-text-primary font-medium truncate">
        {displayText}
      </span>
      {secondaryText && secondaryText !== displayText && (
        <>
          <span className="text-theme-text-secondary">·</span>
          <span className="text-theme-text-secondary truncate">
            {secondaryText}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * 获取员工的显示名称（用于搜索、排序等场景）
 *
 * @param {Object} employee - 员工数据
 * @param {string} context - 上下文
 * @returns {string} 显示名称
 */
export function getEmployeeDisplayName(employee, context = "default") {
  if (!employee) return "未命名员工";

  const { name, employeeName, employeeTitle, instanceName } = employee;

  // 自定义名称优先
  if (instanceName) return instanceName;

  switch (context) {
    case "marketplace":
      return name || employeeName || "未命名员工";
    case "team":
      return employeeTitle || name || employeeName || "未命名员工";
    default:
      return employeeName || name || "未命名员工";
  }
}

/**
 * 获取员工的所有可搜索名称（用于搜索索引）
 *
 * @param {Object} employee - 员工数据
 * @returns {string[]} 所有可搜索的名称
 */
export function getEmployeeSearchableNames(employee) {
  if (!employee) return [];

  const names = new Set();

  if (employee.name) names.add(employee.name);
  if (employee.employeeName) names.add(employee.employeeName);
  if (employee.employeeTitle) names.add(employee.employeeTitle);
  if (employee.instanceName) names.add(employee.instanceName);

  return Array.from(names).filter(Boolean);
}
