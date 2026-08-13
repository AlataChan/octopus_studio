import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { isMobile } from "react-device-detect";
import { ArrowLeft, Check } from "@phosphor-icons/react";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import AssistantLibrary from "@/models/assistantLibrary";

import StepSelectSource from "./StepSelectSource";
import StepConfigDetails from "./StepConfigDetails";
import StepBasicInfo from "./StepBasicInfo";
import StepPlatformConfig from "./StepPlatformConfig";
import StepTestConnection from "./StepTestConnection";
import StepReview from "./StepReview";

/**
 * 创建/编辑助手向导
 * 新流程（4步）：选择来源 → 配置详情 → 测试连接 → 预览确认
 * 编辑模式：基本信息 → 平台配置 → 测试连接 → 预览确认
 */
export default function CreateAssistant() {
  const navigate = useNavigate();
  const { id } = useParams(); // 如果有 id，则是编辑模式
  const isEditMode = !!id;

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // 基本信息
    name: "默认助手",
    employeeName: "",
    employeePosition: "",
    category: "通用",
    industry: "",
    description: "",
    tags: [],
    icon: "🤖",
    avatarUrl: "", // 员工头像 URL

    // 🌟 人格设定（明星员工）
    hasPresetPersona: false, // 是否有预设人格
    personaText: "", // 可编辑的人格设定文本

    // 平台配置
    platformType: "internal",
    platformConfig: {},

    // 内置配置
    systemPrompt: "",
    agentFlowId: "",
    defaultTools: [],
    skills: [], // Skill 能力包
    recommendedModel: "",
    knowledgeModeTemplate: "workspace", // 默认使用 workspace 知识库模式
  });

  const [testResult, setTestResult] = useState(null);
  // 编辑模式：保存原始数据，用于检测平台配置是否变化
  const [originalFormData, setOriginalFormData] = useState(null);

  // 如果是编辑模式，加载现有数据
  useEffect(() => {
    if (isEditMode) {
      loadTemplate();
    }
  }, [id]);

  const loadTemplate = async () => {
    setLoading(true);
    try {
      const result = await AssistantLibrary.getTemplate(id);
      if (result.success && result.data) {
        const loadedData = {
          ...formData,
          ...result.data,
          tags: result.data.tags || [],
        };
        setFormData(loadedData);
        // 保存原始数据副本，用于后续比较
        setOriginalFormData(JSON.parse(JSON.stringify(loadedData)));
      } else {
        showToast("加载助手模板失败", "error");
        navigate(paths.assistantLibrary());
      }
    } catch (error) {
      showToast(error.message, "error");
      navigate(paths.assistantLibrary());
    } finally {
      setLoading(false);
    }
  };

  /**
   * 检测平台配置是否发生变化
   * 只有平台配置变化时，才需要重新测试连接
   */
  const isPlatformConfigChanged = () => {
    if (!originalFormData) return true; // 新建模式，需要测试

    // 检测平台类型是否变化
    if (formData.platformType !== originalFormData.platformType) {
      return true;
    }

    // 检测平台配置是否变化（深度比较）
    const currentConfig = JSON.stringify(formData.platformConfig || {});
    const originalConfig = JSON.stringify(
      originalFormData.platformConfig || {}
    );

    return currentConfig !== originalConfig;
  };

  // 根据创建模式决定步骤流程
  // 编辑模式：使用原有流程（基本信息 → 平台配置 → 测试连接 → 预览确认）
  // 创建模式：使用新流程（选择来源 → 配置详情 → 测试连接 → 预览确认）
  const steps = isEditMode
    ? [
        { number: 1, title: "基本信息", component: StepBasicInfo },
        { number: 2, title: "平台配置", component: StepPlatformConfig },
        { number: 3, title: "测试连接", component: StepTestConnection },
        { number: 4, title: "预览确认", component: StepReview },
      ]
    : [
        { number: 1, title: "选择来源", component: StepSelectSource },
        { number: 2, title: "配置详情", component: StepConfigDetails },
        { number: 3, title: "测试连接", component: StepTestConnection },
        { number: 4, title: "预览确认", component: StepReview },
      ];

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    navigate(paths.assistantLibrary());
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = isEditMode
        ? await AssistantLibrary.update(id, formData)
        : await AssistantLibrary.create(formData);

      if (result.success) {
        showToast(isEditMode ? "助手更新成功！" : "助手创建成功！", "success");
        navigate(paths.assistantLibrary());
      } else {
        showToast(result.error || "操作失败", "error");
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const CurrentStepComponent = steps[currentStep - 1].component;

  if (loading && isEditMode) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-page-texture">
        <div className="text-theme-text-primary z-[1]">加载中...</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      {!isMobile && <Sidebar />}
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="transition-all duration-500 relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll"
      >
        {/* 页面头部 - 科技感设计 */}
        <div className="sticky top-0 z-10 bg-[#131a24]/95 backdrop-blur-sm border-b border-[#1e2940] px-8 py-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4">
              <button
                onClick={handleCancel}
                className="p-2.5 hover:bg-[#1a2332] rounded-xl transition-all duration-200 group"
              >
                <ArrowLeft
                  size={22}
                  className="text-theme-text-secondary group-hover:text-theme-text-primary transition-colors"
                />
              </button>
              <h1 className="text-2xl font-bold text-theme-text-primary">
                {isEditMode ? "编辑助手" : "创建助手"}
              </h1>
            </div>
          </div>

          {/* 步骤导航 */}
          <StepNavigator steps={steps} currentStep={currentStep} />
        </div>

        {/* 步骤内容 */}
        <div className="px-8 py-6">
          <CurrentStepComponent
            formData={formData}
            setFormData={setFormData}
            testResult={testResult}
            setTestResult={setTestResult}
            onNext={handleNext}
            onBack={handleBack}
            onSubmit={handleSubmit}
            loading={loading}
            isEditMode={isEditMode}
            isPlatformConfigChanged={isPlatformConfigChanged}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 步骤导航器组件 - 科技感现代设计
 */
function StepNavigator({ steps, currentStep }) {
  return (
    <div className="flex items-center">
      {steps.map((step, index) => (
        <React.Fragment key={step.number}>
          <div className="flex items-center gap-3">
            {/* 步骤圆圈 */}
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                transition-all duration-300
                ${
                  step.number < currentStep
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-theme-text-primary shadow-lg shadow-green-500/30"
                    : step.number === currentStep
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-theme-text-primary shadow-lg shadow-blue-500/30"
                      : "bg-[#1a2332] text-theme-text-secondary border border-[#2a3a50]"
                }
              `}
            >
              {step.number < currentStep ? (
                <Check size={16} weight="bold" />
              ) : (
                step.number
              )}
            </div>
            {/* 步骤标题 */}
            <span
              className={`
                text-sm font-medium transition-colors duration-300
                ${
                  step.number === currentStep
                    ? "text-theme-text-primary"
                    : step.number < currentStep
                      ? "text-theme-text-secondary"
                      : "text-theme-text-secondary"
                }
              `}
            >
              {step.title}
            </span>
          </div>
          {/* 连接线 */}
          {index < steps.length - 1 && (
            <div className="flex-1 mx-4 max-w-[120px]">
              <div
                className={`
                  h-[2px] rounded-full transition-all duration-500
                  ${
                    step.number < currentStep
                      ? "bg-gradient-to-r from-green-500 to-emerald-500"
                      : "bg-[#2a3a50]"
                  }
                `}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
