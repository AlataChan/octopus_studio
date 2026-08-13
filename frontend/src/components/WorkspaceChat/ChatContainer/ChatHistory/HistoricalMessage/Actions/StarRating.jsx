/**
 * @fileoverview 星级评分组件
 * 用于用户对 AI 回答进行 1-5 星评分
 * 高评分（4-5星）的回答会被同步到知识库
 */

import React, { useState } from "react";
import { Star } from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import { useTranslation } from "react-i18next";

/**
 * 星级评分组件
 * @param {Object} props
 * @param {string} props.chatId - 聊天消息 ID
 * @param {string} props.slug - 工作区 slug
 * @param {number|null} props.initialRating - 初始评分（1-5 或 null）
 */
export default function StarRating({ chatId, slug, initialRating = null }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!chatId) return null;

  const handleRating = async (newRating) => {
    if (isSubmitting) return;

    // 如果点击已选中的星星，取消评分
    const updatedRating = rating === newRating ? null : newRating;

    setIsSubmitting(true);
    try {
      await Workspace.updateChatUserRating(chatId, slug, updatedRating);
      setRating(updatedRating);
    } catch (error) {
      console.error("Failed to update rating:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRatingLabel = (value) => {
    const labels = {
      1: t("chat_window.rating.poor", "很差"),
      2: t("chat_window.rating.fair", "一般"),
      3: t("chat_window.rating.good", "还行"),
      4: t("chat_window.rating.very_good", "很好"),
      5: t("chat_window.rating.excellent", "非常好"),
    };
    return labels[value] || "";
  };

  return (
    <div className="flex items-center gap-x-1 mt-3">
      <span className="text-xs text-zinc-500 mr-1">
        {t("chat_window.rating.label", "评分")}:
      </span>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= (hoverRating || rating || 0);
          const isHighRating = star >= 4;

          return (
            <button
              key={star}
              onClick={() => handleRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              disabled={isSubmitting}
              className={`
                p-0.5 transition-all duration-150
                ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                ${isFilled && isHighRating ? "text-yellow-400" : ""}
                ${isFilled && !isHighRating ? "text-yellow-500" : ""}
              `}
              data-tooltip-id="star-rating"
              data-tooltip-content={getRatingLabel(star)}
              aria-label={`${star} ${t("chat_window.rating.stars", "星")}`}
            >
              <Star
                size={16}
                weight={isFilled ? "fill" : "regular"}
                className={`
                  transition-colors duration-150
                  ${isFilled ? "" : "text-theme-text-secondary hover:text-yellow-300"}
                `}
              />
            </button>
          );
        })}
      </div>
      {rating && (
        <span className="text-xs text-theme-text-secondary ml-1">
          {getRatingLabel(rating)}
        </span>
      )}
    </div>
  );
}
