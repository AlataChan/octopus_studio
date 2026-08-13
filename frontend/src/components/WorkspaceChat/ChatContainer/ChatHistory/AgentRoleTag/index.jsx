import { Users } from "@phosphor-icons/react";
import { memo } from "react";

/**
 * AgentRoleTag 组件
 *
 * @description
 * 在聊天消息旁显示轻量级的 Agent 角色标签，
 * 用于多 Agent 协作场景中标识哪个角色完成了该消息。
 *
 * @param {Object} props - 组件属性
 * @param {Array} props.agentRoles - Agent 角色数组
 * @param {string} props.agentRoles[].role - 角色名称
 * @param {string} props.agentRoles[].description - 角色描述
 * @param {string} props.agentRoles[].flowId - Flow ID
 * @param {boolean} props.compact - 是否使用紧凑模式（默认 false）
 *
 * @example
 * <AgentRoleTag
 *   agentRoles={[
 *     { role: "researcher", description: "Collects information" },
 *     { role: "writer", description: "Writes content" }
 *   ]}
 * />
 */
const AgentRoleTag = memo(({ agentRoles = [], compact = false }) => {
  // 如果没有角色信息，不显示
  if (!agentRoles || agentRoles.length === 0) {
    return null;
  }

  // 如果只有一个角色，显示单个标签
  if (agentRoles.length === 1) {
    const role = agentRoles[0];
    return (
      <div className="flex items-center gap-x-1 mt-2">
        <SingleRoleTag role={role} compact={compact} />
      </div>
    );
  }

  // 如果有多个角色，显示协作标签
  return (
    <div className="flex items-center gap-x-2 mt-2 flex-wrap">
      <MultiRoleTag roles={agentRoles} compact={compact} />
    </div>
  );
});

/**
 * 单个角色标签
 */
function SingleRoleTag({ role, compact }) {
  return (
    <div
      className="inline-flex items-center gap-x-1 px-2 py-0.5 rounded-md bg-theme-sidebar-footer-icon/50 border border-theme-border/50 text-xs text-theme-text-secondary"
      title={role.description || role.role}
    >
      <Users size={12} weight="duotone" className="flex-shrink-0" />
      <span className="font-medium">由【{role.role}】完成</span>
      {!compact && role.description && (
        <span className="text-theme-text-secondary/70 ml-1">
          · {role.description}
        </span>
      )}
    </div>
  );
}

/**
 * 多角色协作标签
 */
function MultiRoleTag({ roles, compact }) {
  // 显示主要角色 + 协作者数量
  const primaryRole = roles[0];
  const otherRolesCount = roles.length - 1;

  return (
    <>
      <div
        className="inline-flex items-center gap-x-1 px-2 py-0.5 rounded-md bg-theme-sidebar-footer-icon/50 border border-theme-border/50 text-xs text-theme-text-secondary"
        title={`多 Agent 协作: ${roles.map((r) => r.role).join(", ")}`}
      >
        <Users size={12} weight="duotone" className="flex-shrink-0" />
        <span className="font-medium">
          由【{primaryRole.role}】
          {otherRolesCount > 0 && (
            <span className="text-theme-text-secondary/70">
              {" "}
              + {otherRolesCount} 个协作者
            </span>
          )}
          完成
        </span>
      </div>

      {/* 如果不是紧凑模式，显示所有角色的详细信息 */}
      {!compact && (
        <div className="flex items-center gap-x-1 flex-wrap">
          {roles.map((role, index) => (
            <div
              key={index}
              className="inline-flex items-center gap-x-1 px-1.5 py-0.5 rounded text-xs text-theme-text-secondary/70"
              title={role.description || role.role}
            >
              <span className="font-mono">{role.role}</span>
              {role.description && (
                <span className="text-theme-text-secondary/50">
                  · {role.description}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * 从消息响应中提取 Agent 角色信息
 *
 * @param {Object} response - 消息响应对象
 * @returns {Array|null} Agent 角色数组，如果没有则返回 null
 */
export function extractAgentRoles(response) {
  if (!response) return null;

  // 尝试解析 response（可能是字符串或对象）
  let parsedResponse = response;
  if (typeof response === "string") {
    try {
      parsedResponse = JSON.parse(response);
    } catch (e) {
      return null;
    }
  }

  // 提取 metadata.agentRoles
  const agentRoles = parsedResponse?.metadata?.agentRoles;

  if (!agentRoles || !Array.isArray(agentRoles) || agentRoles.length === 0) {
    return null;
  }

  return agentRoles;
}

AgentRoleTag.displayName = "AgentRoleTag";

export default AgentRoleTag;
