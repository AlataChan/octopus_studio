import React from "react";
import { Plus, X } from "@phosphor-icons/react";

export default function StartNode({
  config,
  onConfigChange,
  onDeleteVariable,
}) {
  // 确保 variables 始终为数组
  const variables = config?.variables || [{ name: "", value: "" }];

  const handleDeleteVariable = (index, variableName) => {
    // First clean up references, then delete the variable
    onDeleteVariable(variableName);
    const newVars = variables.filter((_, i) => i !== index);
    onConfigChange({ variables: newVars });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-theme-text-primary">变量</h3>
      {variables.map((variable, index) => (
        <div key={index} className="flex gap-2">
          <input
            type="text"
            placeholder="变量名称"
            value={variable.name}
            onChange={(e) => {
              const newVars = [...variables];
              newVars[index].name = e.target.value;
              onConfigChange({ variables: newVars });
            }}
            className="flex-1 border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
            autoComplete="off"
            spellCheck={false}
          />
          <input
            type="text"
            placeholder="初始值"
            value={variable.value}
            onChange={(e) => {
              const newVars = [...variables];
              newVars[index].value = e.target.value;
              onConfigChange({ variables: newVars });
            }}
            className="flex-1 border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
            autoComplete="off"
            spellCheck={false}
          />
          {variables.length > 1 && (
            <button
              onClick={() => handleDeleteVariable(index, variable.name)}
              className="p-2.5 rounded-lg border-none bg-theme-settings-input-bg text-theme-text-primary hover:text-red-500 hover:border-red-500/20 hover:bg-red-500/10 transition-colors duration-300"
              title="删除变量"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {index === variables.length - 1 && (
            <button
              onClick={() => {
                const newVars = [...variables, { name: "", value: "" }];
                onConfigChange({ variables: newVars });
              }}
              className="p-2.5 rounded-lg border-none bg-theme-settings-input-bg text-theme-text-primary hover:bg-theme-action-menu-item-hover transition-colors duration-300"
              title="添加变量"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
