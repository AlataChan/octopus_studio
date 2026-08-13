import React, { useState } from "react";
import { Upload, Database, ChatCircle, Plugs } from "@phosphor-icons/react";
import SourceTypeCard from "./components/SourceTypeCard";
import PresetTemplateSelector from "./components/PresetTemplateSelector";

/**
 * 步骤 1：选择来源
 * 支持三种创建方式：预配置模板、上传配置文件、从零创建
 */
export default function StepSelectSource({ formData, setFormData, onNext }) {
  // 来源类型：preset | upload | scratch
  const [sourceType, setSourceType] = useState(formData.sourceType || "preset");
  // 从零创建时的子类型：workspace | none | platform
  const [scratchMode, setScratchMode] = useState(
    formData.knowledgeModeTemplate || "workspace"
  );
  // 选中的预配置模板
  const [selectedPreset, setSelectedPreset] = useState(null);

  /**
   * 处理预配置模板选择
   */
  const handlePresetSelect = (preset) => {
    setSelectedPreset(preset);
  };

  /**
   * 将人格模板转换为可编辑的文本格式
   * @param {Object} preset - 预设模板
   * @returns {string} 人格设定文本
   */
  const formatPersonaText = (preset) => {
    // 如果没有预设人格，返回空
    if (!preset.hasPresetPersona || !preset.personaTemplates?.length) {
      return "";
    }

    const template = preset.personaTemplates[0];
    const persona = template.persona;
    if (!persona) return "";

    let text = "";

    // 基本信息
    if (persona.employeeName) {
      text += `【员工姓名】${persona.employeeName}\n`;
    }
    if (persona.employeeTitle) {
      text += `【职位头衔】${persona.employeeTitle}\n`;
    }
    if (persona.employeeBio) {
      text += `【个人简介】${persona.employeeBio}\n`;
    }

    // 技能标签
    if (persona.skillTags?.length) {
      text += `【专业技能】${persona.skillTags.join("、")}\n`;
    }

    // 工作经历
    if (persona.workExperience?.length) {
      text += `【工作经历】\n`;
      persona.workExperience.forEach((exp) => {
        text += `- ${exp.title} @ ${exp.company} (${exp.period})\n`;
        if (exp.description) {
          text += `  ${exp.description}\n`;
        }
      });
    }

    // 证书
    if (persona.certifications?.length) {
      text += `【资质证书】${persona.certifications.join("、")}\n`;
    }

    return text.trim();
  };

  /**
   * 处理下一步
   */
  const handleNext = () => {
    // 更新 formData
    const updates = {
      sourceType,
    };

    if (sourceType === "preset" && selectedPreset) {
      // 从预配置模板填充数据
      updates.presetId = selectedPreset.id;
      updates.name = selectedPreset.name;
      updates.description = selectedPreset.description;
      updates.category = selectedPreset.category;
      updates.icon = selectedPreset.icon;
      updates.tags = selectedPreset.tags || [];
      updates.systemPrompt = selectedPreset.systemPrompt;
      updates.defaultTools = selectedPreset.defaultTools || [];
      updates.recommendedModel = selectedPreset.recommendedModel;
      updates.knowledgeModeTemplate =
        selectedPreset.knowledgeModeTemplate || "workspace";
      updates.platformType = "internal";

      // 🌟 处理人格设定
      if (
        selectedPreset.hasPresetPersona &&
        selectedPreset.personaTemplates?.length
      ) {
        const template = selectedPreset.personaTemplates[0];
        const persona = template.persona || {};
        updates.hasPresetPersona = true;
        updates.avatarUrl = template.avatarUrl || "";
        updates.employeeName = persona.employeeName || "";
        updates.employeePosition = persona.employeeTitle || "";
        // 生成可编辑的人格设定文本
        updates.personaText = formatPersonaText(selectedPreset);
      } else {
        // 普通模板，使用简单字段
        updates.hasPresetPersona = false;
        updates.employeeName = selectedPreset.employeeName || "";
        updates.employeePosition = selectedPreset.employeeTitle || "";
        updates.personaText = "";
      }
    } else if (sourceType === "scratch") {
      // 从零创建
      updates.knowledgeModeTemplate = scratchMode;
      updates.platformType = scratchMode === "platform" ? "" : "internal";
      updates.hasPresetPersona = false;
      updates.personaText = "";
    }

    setFormData({ ...formData, ...updates });
    onNext();
  };

  /**
   * 检查是否可以继续
   */
  const canProceed = () => {
    if (sourceType === "preset") {
      return selectedPreset !== null;
    }
    if (sourceType === "upload") {
      // TODO: 检查是否已上传文件
      return false;
    }
    return true; // scratch 模式总是可以继续
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-theme-text-primary mb-1">
          选择创建方式
        </h2>
        <p className="text-theme-text-secondary text-sm">
          选择一种方式来创建您的 AI 员工
        </p>
      </div>

      <div className="space-y-4">
        {/* 方式 1：从预配置模板创建 */}
        <SourceTypeCard
          icon="📦"
          title="从预配置模板创建"
          description="从系统内置的专业模板快速创建，已预设好工具、技能和工作流程"
          badge="推荐"
          selected={sourceType === "preset"}
          onClick={() => setSourceType("preset")}
        >
          {/* 预配置模板选择器 */}
          <PresetTemplateSelector
            selectedPresetId={selectedPreset?.id}
            onSelect={handlePresetSelect}
          />
        </SourceTypeCard>

        {/* 方式 2：上传配置文件（暂不实现） */}
        <SourceTypeCard
          icon="📤"
          title="上传配置文件"
          description="上传 .md 文件创建 Agent/Command，或上传 .zip 创建 Skill 能力包"
          selected={sourceType === "upload"}
          onClick={() => setSourceType("upload")}
        >
          <div className="py-8 text-center text-theme-text-secondary">
            <Upload size={48} className="mx-auto mb-3 opacity-50" />
            <p>此功能即将推出...</p>
          </div>
        </SourceTypeCard>

        {/* 方式 3：从零开始创建 */}
        <SourceTypeCard
          icon="✏️"
          title="从零开始创建"
          description="完全自定义配置您的 AI 员工"
          selected={sourceType === "scratch"}
          onClick={() => setSourceType("scratch")}
        >
          {/* 知识模式选择 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ScratchModeOption
              icon={<Database size={24} />}
              title="内置 Agent"
              description="使用知识库 + 工具"
              selected={scratchMode === "workspace"}
              onClick={() => setScratchMode("workspace")}
            />
            <ScratchModeOption
              icon={<ChatCircle size={24} />}
              title="纯对话模式"
              description="无知识库"
              selected={scratchMode === "none"}
              onClick={() => setScratchMode("none")}
            />
            <ScratchModeOption
              icon={<Plugs size={24} />}
              title="连接外部平台"
              description="Dify / RAGFlow / n8n"
              selected={scratchMode === "platform"}
              onClick={() => setScratchMode("platform")}
            />
          </div>
        </SourceTypeCard>
      </div>

      {/* 操作按钮 - 渐变风格 */}
      <div className="flex justify-end gap-3 mt-8">
        <button
          onClick={handleNext}
          disabled={!canProceed()}
          className={`
            px-8 py-3 rounded-xl font-medium transition-all duration-300
            ${
              canProceed()
                ? "bg-gradient-to-r from-blue-600 to-blue-500 text-theme-text-primary hover:shadow-lg hover:shadow-blue-500/30"
                : "bg-[#1a2332] text-theme-text-secondary border border-[#2a3a50] cursor-not-allowed"
            }
          `}
        >
          下一步
        </button>
      </div>
    </div>
  );
}

/**
 * 从零创建模式选项 - 科技感设计
 */
function ScratchModeOption({ icon, title, description, selected, onClick }) {
  return (
    <div
      className={`
        p-4 rounded-xl cursor-pointer transition-all duration-300
        ${
          selected
            ? "bg-blue-600/20 border-2 border-blue-500/50"
            : "bg-[#1a2332] border border-[#2a3a50] hover:bg-[#1e2940] hover:border-[#3a4a60]"
        }
      `}
      onClick={onClick}
    >
      <div
        className={`mb-2 ${selected ? "text-blue-400" : "text-theme-text-secondary"}`}
      >
        {icon}
      </div>
      <h4 className="font-medium text-theme-text-primary text-sm">{title}</h4>
      <p className="text-xs text-theme-text-secondary mt-1">{description}</p>
    </div>
  );
}
