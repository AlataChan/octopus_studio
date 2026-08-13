import React, { useState, useEffect } from "react";
import UserPreferences from "@/models/userPreferences";
import showToast from "@/utils/toast";

/**
 * AI 交互偏好设置组件
 *
 * - language: 响应语言偏好
 * - code_style: 代码风格
 *
 * 注：解释详细度（回复风格）已移至聊天界面，支持会话级快速切换
 */
export default function AIPreferences() {
  const [preferences, setPreferences] = useState({
    language: "auto",
    explanation_depth: "balanced",
    code_style: "standard",
  });
  const [fields, setFields] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 加载偏好设置和字段定义
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [prefsResult, fieldsResult] = await Promise.all([
          UserPreferences.get(),
          UserPreferences.getFields(),
        ]);

        if (prefsResult.success) {
          setPreferences(prefsResult.preferences);
        }
        if (fieldsResult.success) {
          setFields(fieldsResult.fields);
        }
      } catch (error) {
        console.error("加载偏好设置失败:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleChange = async (key, value) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);

    setSaving(true);
    try {
      const result = await UserPreferences.update({ [key]: value });
      if (result.success) {
        showToast("偏好设置已保存", "success");
      } else {
        showToast(result.error || "保存失败", "error");
        // 回滚
        setPreferences(preferences);
      }
    } catch (error) {
      showToast("保存失败", "error");
      setPreferences(preferences);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("确定要重置所有偏好设置为默认值吗？")) return;

    setSaving(true);
    try {
      const result = await UserPreferences.reset();
      if (result.success) {
        setPreferences(result.preferences);
        showToast("已重置为默认设置", "success");
      }
    } catch (error) {
      showToast("重置失败", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-6 py-4 text-white/60 text-sm">加载偏好设置中...</div>
    );
  }

  return (
    <div className="mt-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-theme-text-primary text-base font-medium">
            AI 交互偏好
          </p>
          <p className="text-xs text-white/60 mt-1">
            自定义 AI 回复的风格和详细程度
          </p>
        </div>
        <button
          onClick={handleReset}
          disabled={saving}
          className="text-xs text-white/40 hover:text-white/60 transition-colors"
        >
          重置为默认
        </button>
      </div>

      <div className="space-y-4">
        {/* 响应语言 */}
        <PreferenceField
          label="响应语言"
          description={fields.language?.description || "AI 回复使用的语言"}
          value={preferences.language}
          options={[
            { value: "auto", label: "自动检测" },
            { value: "zh-CN", label: "中文" },
            { value: "en", label: "English" },
          ]}
          onChange={(v) => handleChange("language", v)}
          disabled={saving}
        />

        {/* 代码风格 */}
        <PreferenceField
          label="代码风格"
          description={fields.code_style?.description || "代码注释和文档风格"}
          value={preferences.code_style}
          options={[
            { value: "minimal", label: "精简" },
            { value: "standard", label: "标准" },
            { value: "verbose", label: "详尽" },
          ]}
          onChange={(v) => handleChange("code_style", v)}
          disabled={saving}
        />
      </div>
    </div>
  );
}

/**
 * 单个偏好字段组件
 */
function PreferenceField({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm text-theme-text-primary">{label}</p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="px-3 py-1.5 bg-white/5 border border-theme-border rounded-lg text-theme-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className="bg-theme-bg-secondary"
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
