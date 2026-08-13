import React from "react";
import { ArrowLeft, CheckCircle } from "@phosphor-icons/react";
import Button from "@/components/Button";

/**
 * 步骤 4: 预览确认
 * 显示所有配置的摘要，确认后创建助手
 */
export default function StepReview({
  formData,
  onBack,
  onSubmit,
  loading,
  isEditMode,
}) {
  const platformLabels = {
    internal: "内置 Agent Flow",
    dify: "Dify",
    ragflow: "RAGFlow",
    n8n: "n8n",
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-theme-bg-primary rounded-lg p-6 space-y-6">
        <h2 className="text-xl font-semibold text-theme-text-primary mb-4">
          预览确认
        </h2>

        {/* 基本信息 */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-theme-text-primary border-b border-theme-border pb-2">
            基本信息
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <InfoItem label="助手名称" value={formData.name} />
            <InfoItem label="员工姓名" value={formData.employeeName} />
            <InfoItem label="员工职位" value={formData.employeePosition} />
            <InfoItem label="分类" value={formData.category} />
            <InfoItem label="行业" value={formData.industry || "不限"} />
            <InfoItem label="图标" value={formData.icon} />
          </div>
          <InfoItem label="描述" value={formData.description} fullWidth />
        </div>

        {/* 平台配置 */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-theme-text-primary border-b border-theme-border pb-2">
            平台配置
          </h3>
          <InfoItem
            label="平台类型"
            value={platformLabels[formData.platformType]}
          />

          {formData.platformType === "dify" && (
            <div className="grid grid-cols-2 gap-4">
              <InfoItem
                label="Base URL"
                value={formData.platformConfig.baseUrl}
              />
              <InfoItem label="API Key" value="••••••••" sensitive />
              <InfoItem label="App ID" value={formData.platformConfig.appId} />
            </div>
          )}

          {formData.platformType === "ragflow" && (
            <div className="grid grid-cols-2 gap-4">
              <InfoItem
                label="Base URL"
                value={formData.platformConfig.baseUrl}
              />
              <InfoItem label="API Key" value="••••••••" sensitive />
              <InfoItem label="类型" value={formData.platformConfig.type} />
              {formData.platformConfig.type === "chat" && (
                <InfoItem
                  label="Chat ID"
                  value={formData.platformConfig.chatId}
                />
              )}
              {formData.platformConfig.type === "agent" && (
                <InfoItem
                  label="Agent ID"
                  value={formData.platformConfig.agentId}
                />
              )}
            </div>
          )}

          {formData.platformType === "n8n" && (
            <div className="space-y-4">
              <InfoItem
                label="Webhook URL"
                value={formData.platformConfig.webhookUrl}
                fullWidth
              />
              <InfoItem
                label="HTTP Method"
                value={formData.platformConfig.method || "POST"}
              />
            </div>
          )}

          {formData.platformType === "internal" && (
            <div className="text-theme-text-secondary text-sm">
              内置 Agent Flow 配置将在创建后进行
            </div>
          )}
        </div>

        {/* 确认提示 */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start gap-x-3">
            <CheckCircle
              size={24}
              className="text-blue-500 flex-shrink-0 mt-0.5"
            />
            <div className="text-sm text-theme-text-secondary">
              <p className="font-medium text-theme-text-primary mb-1">
                {isEditMode ? "确认更新助手？" : "确认创建助手？"}
              </p>
              <p>
                {isEditMode
                  ? "更新后，所有使用此助手的 Workspace 将立即生效。"
                  : "创建后，所有用户都可以在助手库中看到并雇佣此助手。"}
              </p>
            </div>
          </div>
        </div>

        {/* 导航按钮 */}
        <div className="flex justify-between pt-4">
          <Button
            className="border-theme-border bg-theme-bg-secondary text-theme-text-primary hover:bg-theme-bg-container"
            onClick={onBack}
            disabled={loading}
            variant="secondary"
          >
            <ArrowLeft size={20} weight="bold" />
            <span>上一步</span>
          </Button>
          <Button
            className="bg-green-500 text-theme-text-primary hover:bg-green-600"
            onClick={onSubmit}
            disabled={loading}
            loading={loading}
          >
            {loading ? (
              <span>{isEditMode ? "更新中..." : "创建中..."}</span>
            ) : (
              <>
                <CheckCircle size={20} weight="bold" />
                <span>{isEditMode ? "确认更新" : "确认创建"}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// 信息展示项
function InfoItem({ label, value, sensitive = false, fullWidth = false }) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <div className="text-xs text-theme-text-secondary mb-1">{label}</div>
      <div className="text-sm text-theme-text-primary font-medium">
        {sensitive ? value : value || "-"}
      </div>
    </div>
  );
}
