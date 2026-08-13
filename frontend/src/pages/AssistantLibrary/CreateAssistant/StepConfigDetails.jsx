import React, { useState } from "react";
import StepBasicInfo from "./StepBasicInfo";
import StepPlatformConfig from "./StepPlatformConfig";

/**
 * 步骤 2：配置详情
 * 根据步骤 1 选择的来源类型，显示不同的配置内容
 *
 * - preset：显示简化的基本信息表单（可微调预填充的内容）
 * - scratch + workspace/none：显示基本信息 + 内置配置
 * - scratch + platform：显示基本信息 + 平台配置
 */
export default function StepConfigDetails({
  formData,
  setFormData,
  onNext,
  onBack,
}) {
  const sourceType = formData.sourceType || "preset";

  // 当前子步骤：basic | platform
  const [subStep, setSubStep] = useState("basic");

  /**
   * 判断是否需要平台配置步骤
   */
  const needsPlatformConfig = () => {
    // 预配置模板：不需要平台配置（已预配置）
    if (sourceType === "preset") {
      return false;
    }
    // 从零创建：根据知识模式决定
    // workspace 和 none 模式需要内置配置
    // platform 模式需要外部平台配置
    return true;
  };

  /**
   * 处理基本信息表单的下一步
   */
  const handleBasicNext = () => {
    if (needsPlatformConfig()) {
      setSubStep("platform");
    } else {
      onNext();
    }
  };

  /**
   * 处理平台配置表单的返回
   */
  const handlePlatformBack = () => {
    setSubStep("basic");
  };

  /**
   * 渲染当前子步骤
   */
  const renderSubStep = () => {
    if (subStep === "basic") {
      return (
        <StepBasicInfo
          formData={formData}
          setFormData={setFormData}
          onNext={handleBasicNext}
          onBack={onBack}
          // 如果是预配置模板，显示简化模式
          simplified={sourceType === "preset"}
        />
      );
    }

    if (subStep === "platform") {
      return (
        <StepPlatformConfig
          formData={formData}
          setFormData={setFormData}
          onNext={onNext}
          onBack={handlePlatformBack}
        />
      );
    }
  };

  return (
    <div>
      {/* 子步骤指示器（仅当有多个子步骤时显示） */}
      {needsPlatformConfig() && (
        <div className="flex items-center justify-center gap-2 mb-6">
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              subStep === "basic"
                ? "bg-theme-accent-primary"
                : "bg-theme-border"
            }`}
          />
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              subStep === "platform"
                ? "bg-theme-accent-primary"
                : "bg-theme-border"
            }`}
          />
        </div>
      )}

      {renderSubStep()}
    </div>
  );
}
