import React, { useState } from "react";
import {
  Notebook,
  Check,
  SpinnerGap,
  ShieldWarning,
} from "@phosphor-icons/react";
import Memory from "@/models/memory";
import showToast from "@/utils/toast";
import { useTranslation } from "react-i18next";

/**
 * 记住按钮组件
 *
 * 允许用户将重要的对话内容保存到记忆系统中
 * Phase 1: 用户触发「记住」功能
 * Phase 2: PII 检测和脱敏确认
 */
export default function RememberButton({ message, slug, chatId }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [piiConfirm, setPiiConfirm] = useState(null); // { detected, sanitizedPreview }

  const handleRemember = async (sanitizeMode = "confirm") => {
    if (saving || saved) return;

    setSaving(true);
    try {
      // 提取消息内容（限制长度）
      // 防御性检查：确保 message 存在且不为空
      console.log(
        "[RememberButton] message type:",
        typeof message,
        "value:",
        message
      );

      let content = "";
      if (typeof message === "string") {
        content = message.trim().slice(0, 2000);
      } else if (message && typeof message === "object") {
        // 如果 message 是对象，尝试获取 content 属性
        content = (
          message.content ||
          message.text ||
          JSON.stringify(message)
        ).slice(0, 2000);
      } else if (message) {
        content = String(message).trim().slice(0, 2000);
      }

      console.log(
        "[RememberButton] extracted content:",
        content?.substring(0, 100)
      );

      // 如果内容为空，显示错误提示
      if (!content) {
        console.error(
          "[RememberButton] Content is empty, message was:",
          message
        );
        showToast("消息内容为空，无法保存", "error");
        setSaving(false);
        return;
      }

      const result = await Memory.save(slug, {
        content,
        type: "fact",
        sanitize: sanitizeMode,
        metadata: {
          source: "chat",
          chatId,
          savedAt: new Date().toISOString(),
        },
      });

      // Phase 2: 处理 PII 确认请求
      if (result.needsConfirmation) {
        setPiiConfirm({
          detected: result.detected,
          sanitizedPreview: result.sanitizedPreview,
          originalContent: content,
        });
        setSaving(false);
        return;
      }

      if (result.success) {
        setSaved(true);
        setPiiConfirm(null);
        showToast(
          result.wasSanitized ? "已脱敏保存到记忆" : "已保存到记忆",
          "success"
        );
        setTimeout(() => setSaved(false), 3000);
      } else {
        showToast(result.error || "保存失败", "error");
      }
    } catch (error) {
      console.error("保存记忆失败:", error);
      showToast("保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  // 处理 PII 确认选择
  const handlePiiChoice = async (choice) => {
    if (choice === "sanitize") {
      // 脱敏保存
      setSaving(true);
      await handleRemember("auto");
    } else if (choice === "original") {
      // 原文保存
      setSaving(true);
      await handleRemember("skip");
    } else {
      // 取消
      setPiiConfirm(null);
    }
  };

  // PII 确认弹窗
  if (piiConfirm) {
    return (
      <div className="mt-3 relative">
        <div className="absolute bottom-full left-0 mb-2 p-3 bg-theme-bg-secondary border border-yellow-500/50 rounded-lg shadow-lg w-64 z-50">
          <div className="flex items-center gap-2 mb-2">
            <ShieldWarning className="w-5 h-5 text-yellow-500" />
            <span className="text-sm font-medium text-theme-text-primary">
              检测到敏感信息
            </span>
          </div>
          <p className="text-xs text-theme-text-secondary mb-2">
            检测到 {piiConfirm.detected.length} 处敏感信息：
            {piiConfirm.detected.map((d) => d.type).join(", ")}
          </p>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => handlePiiChoice("sanitize")}
              className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-theme-text-primary rounded"
            >
              脱敏保存
            </button>
            <button
              onClick={() => handlePiiChoice("original")}
              className="px-2 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-theme-text-primary rounded"
            >
              原文保存
            </button>
            <button
              onClick={() => handlePiiChoice("cancel")}
              className="px-2 py-1 text-xs bg-zinc-600 hover:bg-zinc-700 text-theme-text-primary rounded"
            >
              取消
            </button>
          </div>
        </div>
        <Notebook color="#eab308" size={20} className="mb-1" weight="fill" />
      </div>
    );
  }

  return (
    <div className="mt-3 relative">
      <button
        onClick={() => handleRemember("confirm")}
        disabled={saving}
        data-tooltip-id="remember-button"
        data-tooltip-content={
          saved
            ? t("chat_window.remembered")
            : t("chat_window.remember_message")
        }
        className="text-theme-text-secondary disabled:opacity-50"
        aria-label={t("chat_window.remember_message")}
      >
        {saving ? (
          <SpinnerGap
            color="var(--theme-sidebar-footer-icon-fill)"
            size={20}
            className="mb-1 animate-spin"
          />
        ) : saved ? (
          <Check color="#22c55e" size={20} className="mb-1" />
        ) : (
          <Notebook
            color="var(--theme-sidebar-footer-icon-fill)"
            size={20}
            className="mb-1"
            weight="regular"
          />
        )}
      </button>
    </div>
  );
}
