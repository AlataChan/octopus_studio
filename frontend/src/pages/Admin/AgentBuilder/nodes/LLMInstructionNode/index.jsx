import React from "react";

export default function LLMInstructionNode({
  config,
  onConfigChange,
  renderVariableSelect,
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          指令
        </label>
        <textarea
          value={config?.instruction || ""}
          onChange={(e) =>
            onConfigChange({
              ...config,
              instruction: e.target.value,
            })
          }
          className="w-full border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
          rows={3}
          placeholder="输入给 LLM 的指令..."
        />
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
