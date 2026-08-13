import React, { forwardRef } from "react";

const FlowInfoNode = forwardRef(({ config, onConfigChange }, refs) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          流程名称
        </label>
        <div className="flex flex-col text-xs text-theme-text-secondary mt-2 mb-3">
          <p className="">给流程起一个 LLM 容易理解的名称非常重要。</p>
          <p>例如："发送Discord消息"、"查询股票价格"、"查询天气"</p>
        </div>
        <input
          id="agent-flow-name-input"
          ref={refs?.nameRef}
          type="text"
          placeholder="输入流程名称"
          value={config?.name || ""}
          onChange={(e) =>
            onConfigChange({
              ...config,
              name: e.target.value,
            })
          }
          className="w-full border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          描述
        </label>
        <div className="flex flex-col text-xs text-theme-text-secondary mt-2 mb-3">
          <p className="">
            同样重要的是给流程一个 LLM 容易理解的描述。
            请确保包含流程的目的、使用场景以及其他相关信息。
          </p>
        </div>
        <textarea
          ref={refs?.descriptionRef}
          value={config?.description || ""}
          onChange={(e) =>
            onConfigChange({
              ...config,
              description: e.target.value,
            })
          }
          className="w-full border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
          rows={3}
          placeholder="输入流程描述"
        />
      </div>
    </div>
  );
});

FlowInfoNode.displayName = "FlowInfoNode";
export default FlowInfoNode;
