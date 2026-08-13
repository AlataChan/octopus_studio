import React from "react";
import { Users, Briefcase, Award } from "react-feather";
import AssistantLibrary from "@/models/assistantLibrary";

/**
 * AI 员工卡片组件
 * 用于在助手库中展示 AI 员工信息
 */
export default function AIEmployeeCard({ employee, onClick }) {
  const skills = employee.skills ? JSON.parse(employee.skills) : [];
  const certifications = employee.certifications
    ? JSON.parse(employee.certifications)
    : [];

  return (
    <div
      onClick={onClick}
      className="group relative bg-theme-bg-secondary hover:bg-theme-bg-container border border-theme-border hover:border-theme-accent-primary rounded-xl p-6 cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
    >
      {/* 员工头像和基本信息 */}
      <div className="flex items-start gap-4 mb-4">
        {/* 头像 */}
        <div className="flex-shrink-0">
          <img
            src={
              AssistantLibrary.getIconUrl(employee.avatarUrl) ||
              "/ai-employees/default-avatar.svg"
            }
            alt={employee.employeeName}
            className="w-20 h-20 rounded-full object-cover border-2 border-theme-accent-primary"
          />
        </div>

        {/* 姓名和职位 */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-theme-text-primary mb-1 truncate">
            {employee.employeeName || employee.name}
          </h3>
          <p className="text-sm text-theme-accent-primary font-semibold mb-2">
            {employee.employeeTitle || employee.category}
          </p>

          {/* 分类标签 */}
          <div className="flex items-center gap-2 text-xs text-theme-text-secondary">
            <Briefcase size={14} />
            <span>{employee.category}</span>
          </div>
        </div>
      </div>

      {/* 简介 */}
      <p className="text-sm text-theme-text-secondary mb-4 line-clamp-3">
        {employee.employeeBio || employee.description}
      </p>

      {/* 技能标签 */}
      {skills.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-theme-accent-primary" />
            <span className="text-xs font-semibold text-theme-text-primary">
              核心技能
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {skills.slice(0, 4).map((skill, index) => (
              <span
                key={index}
                className="px-2 py-1 text-xs bg-theme-accent-primary/10 text-theme-accent-primary rounded-md"
              >
                {skill}
              </span>
            ))}
            {skills.length > 4 && (
              <span className="px-2 py-1 text-xs text-theme-text-secondary">
                +{skills.length - 4}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 资质认证 */}
      {certifications.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Award size={14} className="text-theme-accent-primary" />
            <span className="text-xs font-semibold text-theme-text-primary">
              资质认证
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {certifications.slice(0, 2).map((cert, index) => (
              <span
                key={index}
                className="px-2 py-1 text-xs bg-theme-bg-container text-theme-text-secondary rounded-md border border-theme-border"
              >
                {cert}
              </span>
            ))}
            {certifications.length > 2 && (
              <span className="px-2 py-1 text-xs text-theme-text-secondary">
                +{certifications.length - 2}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 底部操作按钮 */}
      <div className="flex items-center justify-between pt-4 border-t border-theme-border">
        <span className="text-xs text-theme-text-secondary">
          {employee.industry || "通用"}
        </span>
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--theme-button-ghost-bg)] px-3 py-1.5 text-xs font-medium text-theme-text-primary"
        >
          查看详情
        </span>
      </div>

      {/* 悬停效果 */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-theme-accent-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}
