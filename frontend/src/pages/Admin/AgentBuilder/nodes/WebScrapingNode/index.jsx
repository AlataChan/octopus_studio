import { Info } from "@phosphor-icons/react";
import React from "react";

export default function WebScrapingNode({
  config,
  onConfigChange,
  renderVariableSelect,
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          要抓取的 URL
        </label>
        <input
          type="url"
          value={config?.url || ""}
          onChange={(e) =>
            onConfigChange({
              ...config,
              url: e.target.value,
            })
          }
          className="w-full border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          捕获页面内容为
        </label>
        <select
          value={config.captureAs}
          onChange={(e) =>
            onConfigChange({ ...config, captureAs: e.target.value })
          }
          className="w-full border-none bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
        >
          {[
            { label: "仅文本内容", value: "text" },
            { label: "原始 HTML", value: "html" },
            { label: "CSS 选择器", value: "querySelector" },
          ].map((captureAs) => (
            <option
              key={captureAs.value}
              value={captureAs.value}
              className="bg-theme-settings-input-bg"
            >
              {captureAs.label}
            </option>
          ))}
        </select>
      </div>

      {config.captureAs === "querySelector" && (
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            CSS 选择器
          </label>
          <p className="text-xs text-theme-text-secondary mb-2">
            输入有效的 CSS 选择器来抓取页面内容。
          </p>
          <input
            value={config.querySelector}
            onChange={(e) =>
              onConfigChange({ ...config, querySelector: e.target.value })
            }
            placeholder=".article-content, #content, .main-content 等"
            className="w-full border-none bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
          />
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="flex flex-row items-center gap-x-1 mb-2">
          <label className="block text-sm font-medium text-theme-text-primary">
            内容摘要
          </label>
          <Info
            size={16}
            className="text-theme-text-secondary cursor-pointer"
            data-tooltip-id="content-summarization-tooltip"
          />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enableSummarization ?? true}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  enableSummarization: e.target.checked,
                })
              }
              className="sr-only peer"
              aria-label="Toggle content summarization"
            />
            <div className="w-11 h-6 bg-theme-settings-input-bg peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-button/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-button"></div>
          </label>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          结果变量
        </label>
        {renderVariableSelect(
          config.resultVariable,
          (value) => onConfigChange({ ...config, resultVariable: value }),
          "选择或创建变量",
          true
        )}
      </div>
    </div>
  );
}
