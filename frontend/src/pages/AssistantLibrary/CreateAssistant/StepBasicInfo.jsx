import React, { useState } from "react";
import { ArrowRight, X, Plus } from "@phosphor-icons/react";
import Button from "@/components/Button";
import AssistantLibrary from "@/models/assistantLibrary";
import showToast from "@/utils/toast";

/**
 * 步骤: 基本信息
 * 包含助手名称、分类、描述、平台类型选择等
 *
 * @param {Object} props
 * @param {Object} props.formData - 表单数据
 * @param {Function} props.setFormData - 更新表单数据
 * @param {Function} props.onNext - 下一步回调
 * @param {Function} props.onBack - 返回回调（可选）
 * @param {boolean} props.simplified - 简化模式（用于预配置模板微调）
 */
export default function StepBasicInfo({
  formData,
  setFormData,
  onNext,
  onBack,
  simplified = false,
}) {
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()],
      });
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((tag) => tag !== tagToRemove),
    });
  };

  // 处理图片上传
  const handleIconUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      showToast("请上传图片文件", "error");
      return;
    }

    // 验证文件大小（最大 2MB）
    if (file.size > 2 * 1024 * 1024) {
      showToast("图片大小不能超过 2MB", "error");
      return;
    }

    setUploading(true);
    const formDataObj = new FormData();
    formDataObj.append("file", file);

    const { success, filename, error } =
      await AssistantLibrary.uploadIcon(formDataObj);
    setUploading(false);

    if (!success) {
      showToast(`上传失败: ${error}`, "error");
      return;
    }

    // 保存文件名到 formData.avatarUrl
    setFormData({ ...formData, avatarUrl: filename });
    showToast("头像上传成功", "success");
  };

  // 移除头像
  const handleRemoveIcon = () => {
    setFormData({ ...formData, avatarUrl: "" });
  };

  const handleNext = () => {
    // 验证必填字段 - 只验证助手名称
    if (!formData.name || formData.name.trim() === "") {
      alert("请填写助手名称");
      return;
    }
    onNext();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-theme-bg-primary rounded-lg p-6 space-y-6">
        <h2 className="text-xl font-semibold text-theme-text-primary mb-4">
          基本信息
        </h2>

        {/* 助手名称 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            助手名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="例如：市场调研助手"
            className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
          />
        </div>

        {/* 员工姓名 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            员工姓名
          </label>
          <input
            type="text"
            value={formData.employeeName}
            onChange={(e) => handleChange("employeeName", e.target.value)}
            placeholder="例如：张小明"
            className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
          />
        </div>

        {/* 员工职位 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            员工职位
          </label>
          <input
            type="text"
            value={formData.employeePosition}
            onChange={(e) => handleChange("employeePosition", e.target.value)}
            placeholder="例如：市场分析师"
            className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
          />
        </div>

        {/* 分类 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            分类
          </label>
          <select
            value={formData.category || "通用"}
            onChange={(e) => handleChange("category", e.target.value)}
            className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none"
          >
            <option value="通用">通用</option>
            <option value="营销">营销</option>
            <option value="研发">研发</option>
            <option value="客服">客服</option>
            <option value="财务">财务</option>
            <option value="人力资源">人力资源</option>
          </select>
        </div>

        {/* 行业 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            行业（可选）
          </label>
          <select
            value={formData.industry || ""}
            onChange={(e) => handleChange("industry", e.target.value)}
            className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none"
          >
            <option value="">不限</option>
            <option value="金融">金融</option>
            <option value="医疗">医疗</option>
            <option value="制造">制造</option>
            <option value="零售">零售</option>
            <option value="教育">教育</option>
            <option value="科技">科技</option>
          </select>
        </div>

        {/* 描述 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            描述
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="描述这个助手的功能和用途..."
            rows={4}
            className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none resize-none"
          />
        </div>

        {/* 技能标签 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            技能标签（可选）
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="输入标签后按回车添加"
              className="flex-1 px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="px-4 py-2.5 bg-theme-accent-primary hover:bg-theme-accent-primary/90 text-theme-text-primary rounded-lg transition-all duration-300 text-sm font-medium"
            >
              添加
            </button>
          </div>
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-theme-accent-primary/20 text-theme-accent-primary rounded-full text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:bg-theme-accent-primary/30 rounded-full p-0.5"
                  >
                    <X size={14} weight="bold" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 人格设定（明星员工专属） */}
        {formData.hasPresetPersona && (
          <div>
            <label className="block text-sm font-medium text-theme-text-primary mb-2">
              <span className="flex items-center gap-2">
                <span>🌟 人格设定</span>
                <span className="text-xs text-theme-accent-primary bg-theme-accent-primary/10 px-2 py-0.5 rounded-full">
                  明星员工
                </span>
              </span>
            </label>
            <textarea
              value={formData.personaText || ""}
              onChange={(e) => handleChange("personaText", e.target.value)}
              placeholder="【员工姓名】&#10;【职位头衔】&#10;【个人简介】&#10;【专业技能】&#10;【工作经历】&#10;【资质证书】"
              rows={10}
              className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none resize-none font-mono"
            />
            <p className="text-xs text-theme-text-secondary mt-1">
              人格设定定义了 AI
              员工的身份背景、专业能力和职业履历，使其更具真实感。您可以直接修改上述内容。
            </p>
          </div>
        )}

        {/* 角色提示词 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            角色提示词（System Prompt）
          </label>
          <textarea
            value={formData.systemPrompt || ""}
            onChange={(e) => handleChange("systemPrompt", e.target.value)}
            placeholder="定义 AI 员工的角色、性格、专业领域和行为准则...&#10;&#10;示例：你是一位专业的市场调研分析师，擅长收集和分析市场数据。你的工作风格严谨专业，善于从数据中发现洞察。"
            rows={6}
            className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none resize-none"
          />
          <p className="text-xs text-theme-text-secondary mt-1">
            角色提示词将作为系统消息发送给 LLM，用于定义 AI
            员工的角色定位、专业能力和行为风格
          </p>
        </div>

        {/* 员工头像 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            员工头像（可选）
          </label>
          <div className="flex items-center gap-6">
            {/* 头像预览 */}
            <label className="w-24 h-24 flex flex-col items-center justify-center bg-theme-settings-input-bg transition-all duration-300 rounded-full border-2 border-dashed border-theme-text-secondary/30 cursor-pointer hover:border-theme-accent-primary hover:bg-theme-settings-input-bg/80">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleIconUpload}
                disabled={uploading}
              />
              {formData.avatarUrl ? (
                <img
                  src={AssistantLibrary.getIconUrl(formData.avatarUrl)}
                  alt="员工头像"
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <Plus className="w-6 h-6 text-theme-text-secondary mb-1" />
                  <span className="text-xs text-theme-text-secondary">
                    {uploading ? "上传中..." : "上传头像"}
                  </span>
                </div>
              )}
            </label>

            {/* 操作说明 */}
            <div className="flex-1">
              <p className="text-sm text-theme-text-primary mb-2">
                点击左侧圆圈上传员工头像
              </p>
              <p className="text-xs text-theme-text-secondary mb-3">
                支持 JPG、PNG 格式，建议尺寸 800x800，最大 2MB
              </p>
              {formData.avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveIcon}
                  className="text-sm text-red-500 hover:text-red-600 transition-colors"
                >
                  移除头像
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-between pt-4">
          {/* 返回按钮 */}
          {onBack ? (
            <button
              onClick={onBack}
              className="px-6 py-2.5 text-theme-text-secondary hover:text-theme-text-primary transition-colors font-medium"
            >
              返回
            </button>
          ) : (
            <div />
          )}

          {/* 下一步按钮 */}
          <Button onClick={handleNext}>
            <span>下一步</span>
            <ArrowRight size={20} weight="bold" />
          </Button>
        </div>

        {/* 简化模式提示 */}
        {simplified && (
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400">
              💡
              您正在基于预配置模板创建，大部分配置已预设好。您可以在此微调基本信息。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
