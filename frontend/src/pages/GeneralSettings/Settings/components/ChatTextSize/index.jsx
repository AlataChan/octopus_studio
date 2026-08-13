import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getLocalStorageItem, setLocalStorageItem } from "@/utils/storage";

const TEXT_SIZE_KEY = "alata_text_size";

/**
 * 聊天字体大小设置组件
 * 用于在 Settings/Interface 页面设置聊天界面的字体大小
 */
export default function ChatTextSize() {
  const { t } = useTranslation();
  const [selectedSize, setSelectedSize] = useState("normal");

  useEffect(() => {
    const storedSize = getLocalStorageItem(TEXT_SIZE_KEY);
    if (storedSize) {
      setSelectedSize(storedSize);
    }
  }, []);

  const handleTextSizeChange = (size) => {
    setSelectedSize(size);
    setLocalStorageItem(TEXT_SIZE_KEY, size);
    window.dispatchEvent(new CustomEvent("textSizeChange", { detail: size }));
  };

  const sizes = [
    { value: "small", label: "小", preview: "text-xs" },
    { value: "normal", label: "正常", preview: "text-sm" },
    { value: "large", label: "大", preview: "text-base" },
  ];

  return (
    <div className="flex flex-col gap-y-2 mt-4">
      <div className="flex flex-col gap-y-1">
        <label className="text-theme-text-primary text-sm font-semibold block">
          聊天字体大小
        </label>
        <p className="text-xs text-white/60">调整聊天界面中消息的字体大小</p>
      </div>
      <div className="flex gap-x-3 mt-2">
        {sizes.map((size) => (
          <button
            key={size.value}
            onClick={() => handleTextSizeChange(size.value)}
            className={`
              flex items-center justify-center px-4 py-2 rounded-lg border transition-all
              ${
                selectedSize === size.value
                  ? "border-primary-button bg-primary-button/20 text-theme-text-primary"
                  : "border-theme-border-medium text-white/60 hover:border-white/40 hover:text-white/80"
              }
            `}
          >
            <span className={size.preview}>{size.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
