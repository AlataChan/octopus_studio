import React, { useState } from "react";
import { X, Briefcase, Award, TrendingUp, Users } from "react-feather";
import AssistantLibrary from "@/models/assistantLibrary";
import Button from "@/components/Button";

/**
 * AI 员工详情 Modal
 * 显示完整的员工档案信息
 */
export default function AIEmployeeModal({ employee, isOpen, onClose, onHire }) {
  const [selectedWorkspace, setSelectedWorkspace] = useState("");

  if (!isOpen || !employee) return null;

  const skills = employee.skills ? JSON.parse(employee.skills) : [];
  const workExperience = employee.workExperience
    ? JSON.parse(employee.workExperience)
    : [];
  const certifications = employee.certifications
    ? JSON.parse(employee.certifications)
    : [];

  const handleHire = () => {
    if (selectedWorkspace) {
      onHire(employee.id, selectedWorkspace);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative bg-theme-bg-secondary rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-theme-bg-container hover:bg-theme-bg-sidebar transition-colors"
        >
          <X size={20} className="text-theme-text-secondary" />
        </button>

        {/* 滚动内容区 */}
        <div className="overflow-y-auto max-h-[90vh] p-8">
          {/* 头部：头像和基本信息 */}
          <div className="flex items-start gap-6 mb-8">
            <img
              src={
                AssistantLibrary.getIconUrl(employee.avatarUrl) ||
                "/ai-employees/default-avatar.svg"
              }
              alt={employee.employeeName}
              className="w-32 h-32 rounded-2xl object-cover border-4 border-theme-accent-primary shadow-lg"
            />
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-theme-text-primary mb-2">
                {employee.employeeName || employee.name}
              </h2>
              <p className="text-lg text-theme-accent-primary font-semibold mb-3">
                {employee.employeeTitle || employee.category}
              </p>
              <div className="flex items-center gap-4 text-sm text-theme-text-secondary">
                <div className="flex items-center gap-2">
                  <Briefcase size={16} />
                  <span>{employee.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} />
                  <span>{employee.industry || "通用"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 简介 */}
          <section className="mb-8">
            <h3 className="text-xl font-bold text-theme-text-primary mb-3 flex items-center gap-2">
              <Users size={20} className="text-theme-accent-primary" />
              简介
            </h3>
            <p className="text-theme-text-secondary leading-relaxed">
              {employee.employeeBio || employee.description}
            </p>
          </section>

          {/* 核心技能 */}
          {skills.length > 0 && (
            <section className="mb-8">
              <h3 className="text-xl font-bold text-theme-text-primary mb-3">
                核心技能
              </h3>
              <div className="flex flex-wrap gap-3">
                {skills.map((skill, index) => (
                  <span
                    key={index}
                    className="px-4 py-2 bg-theme-accent-primary/10 text-theme-accent-primary rounded-lg font-semibold"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 工作经历 */}
          {workExperience.length > 0 && (
            <section className="mb-8">
              <h3 className="text-xl font-bold text-theme-text-primary mb-4 flex items-center gap-2">
                <Briefcase size={20} className="text-theme-accent-primary" />
                工作经历
              </h3>
              <div className="space-y-4">
                {workExperience.map((exp, index) => (
                  <div
                    key={index}
                    className="p-4 bg-theme-bg-container rounded-lg border border-theme-border"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-theme-text-primary">
                          {exp.title}
                        </h4>
                        <p className="text-sm text-theme-text-secondary">
                          {exp.company}
                        </p>
                      </div>
                      <span className="text-xs text-theme-text-secondary bg-theme-bg-sidebar px-3 py-1 rounded-full">
                        {exp.period}
                      </span>
                    </div>
                    <p className="text-sm text-theme-text-secondary">
                      {exp.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 资质认证 */}
          {certifications.length > 0 && (
            <section className="mb-8">
              <h3 className="text-xl font-bold text-theme-text-primary mb-3 flex items-center gap-2">
                <Award size={20} className="text-theme-accent-primary" />
                资质认证
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {certifications.map((cert, index) => (
                  <div
                    key={index}
                    className="p-3 bg-theme-bg-container rounded-lg border border-theme-border text-center"
                  >
                    <span className="text-sm font-semibold text-theme-text-primary">
                      {cert}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="sticky bottom-0 bg-theme-bg-secondary border-t border-theme-border p-6">
          <Button
            onClick={handleHire}
            className="w-full min-h-[56px] rounded-xl text-lg font-bold hover:scale-[1.02]"
          >
            一键聘用
          </Button>
        </div>
      </div>
    </div>
  );
}
