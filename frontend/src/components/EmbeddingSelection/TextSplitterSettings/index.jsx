import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

function isNullOrNaN(value) {
  if (value === null) return true;
  return isNaN(value);
}

/**
 * 文本分割设置组件
 * 可在嵌入器设置页面中复用
 */
export default function TextSplitterSettings({
  settings,
  onChange,
  showTitle = true,
}) {
  const { t } = useTranslation();
  const [chunkSize, setChunkSize] = useState(
    isNullOrNaN(settings?.text_splitter_chunk_size)
      ? 1000
      : Number(settings?.text_splitter_chunk_size)
  );
  const [chunkOverlap, setChunkOverlap] = useState(
    isNullOrNaN(settings?.text_splitter_chunk_overlap)
      ? 20
      : Number(settings?.text_splitter_chunk_overlap)
  );

  const maxChunkSize = settings?.max_embed_chunk_size || 1000;

  // 验证逻辑
  const isChunkSizeExceeded = chunkSize > maxChunkSize;
  const isChunkSizeLow =
    chunkSize <= maxChunkSize && chunkSize < maxChunkSize * 0.3;
  const isOverlapInvalid = chunkOverlap >= chunkSize;

  useEffect(() => {
    if (onChange) {
      onChange({
        text_splitter_chunk_size: chunkSize,
        text_splitter_chunk_overlap: chunkOverlap,
      });
    }
  }, [chunkSize, chunkOverlap]);

  return (
    <div className="w-full">
      {showTitle && (
        <div className="flex flex-col gap-y-1 mb-6 pb-4 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
          <div className="flex gap-x-4 items-center">
            <p className="text-base font-bold text-theme-text-primary">
              {t("text.title") || "文本分割和分块首选项"}
            </p>
          </div>
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60">
            {t("text.desc-start") ||
              "有时,你可能希望更改默认文本在向量化和存储到向量数据库之前的分块方式。"}
            <br />
            {t("text.desc-end") ||
              "只有在了解文本分割的工作原理及其副作用时,才应修改此设置。"}
          </p>
        </div>
      )}

      {/* 文本块大小设置 */}
      <div className="flex flex-col gap-y-4 mb-8">
        <div className="flex flex-col max-w-[300px]">
          <div className="flex flex-col gap-y-2 mb-4">
            <label className="text-theme-text-primary text-sm font-semibold block">
              {t("text.size.title") || "文本块大小"}
            </label>
            <p className="text-xs text-white/60">
              {t("text.size.description") ||
                "这是单个向量中以文本形式存储的最大字符长度。"}
            </p>
          </div>
          <input
            type="number"
            name="text_splitter_chunk_size"
            min={1}
            max={maxChunkSize}
            value={chunkSize}
            onChange={(e) => setChunkSize(Number(e.target.value))}
            onWheel={(e) => e?.currentTarget?.blur()}
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="向量化文本的最大长度"
            required={true}
            autoComplete="off"
          />

          {/* 实时验证提示 */}
          {isChunkSizeExceeded && (
            <p className="text-red-400 text-xs mt-2 flex items-start gap-x-1">
              <span>⚠️</span>
              <span>超过当前模型限制,保存时将自动使用模型支持的最大值</span>
            </p>
          )}
          {!isChunkSizeExceeded && isChunkSizeLow && (
            <p className="text-yellow-400 text-xs mt-2 flex items-start gap-x-1">
              <span>💡</span>
              <span>当前模型支持更大的文本块,建议增大此值以提高检索效果</span>
            </p>
          )}
        </div>
      </div>

      {/* 文本块重叠设置 */}
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col max-w-[300px]">
          <div className="flex flex-col gap-y-2 mb-4">
            <label className="text-theme-text-primary text-sm font-semibold block">
              {t("text.overlap.title") || "文本块重叠"}
            </label>
            <p className="text-xs text-white/60">
              {t("text.overlap.description") ||
                "这是两个相邻文本块之间发生的最大字符重叠。"}
            </p>
          </div>
          <input
            type="number"
            name="text_splitter_chunk_overlap"
            min={0}
            value={chunkOverlap}
            onChange={(e) => setChunkOverlap(Number(e.target.value))}
            onWheel={(e) => e?.currentTarget?.blur()}
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="文本块之间的重叠字符数"
            required={true}
            autoComplete="off"
          />

          {/* 重叠验证提示 */}
          {isOverlapInvalid && (
            <p className="text-red-400 text-xs mt-2 flex items-start gap-x-1">
              <span>⚠️</span>
              <span>重叠值不能大于或等于文本块大小</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
