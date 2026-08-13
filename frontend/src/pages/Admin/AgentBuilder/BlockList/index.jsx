import React from "react";
import {
  X,
  CaretUp,
  CaretDown,
  Globe,
  Browser,
  Brain,
  Flag,
  Info,
  BracketsCurly,
} from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import StartNode from "../nodes/StartNode";
import ApiCallNode from "../nodes/ApiCallNode";
import LLMInstructionNode from "../nodes/LLMInstructionNode";
import FinishNode from "../nodes/FinishNode";
import WebScrapingNode from "../nodes/WebScrapingNode";
import FlowInfoNode from "../nodes/FlowInfoNode";
import UnsupportedBlock, {
  isUnsupportedBlockType,
} from "../Block/UnsupportedBlock";

const BLOCK_TYPES = {
  FLOW_INFO: "flowInfo",
  START: "start",
  API_CALL: "apiCall",
  LLM_INSTRUCTION: "llmInstruction",
  WEB_SCRAPING: "webScraping",
  FINISH: "finish",
};

const BLOCK_INFO = {
  [BLOCK_TYPES.FLOW_INFO]: {
    label: "流程信息",
    icon: <Info className="w-5 h-5 text-theme-text-primary" />,
    description: "基本流程信息",
    defaultConfig: {
      name: "",
      description: "",
    },
    getSummary: (config) => config.name || "未命名流程",
  },
  [BLOCK_TYPES.START]: {
    label: "流程变量",
    icon: <BracketsCurly className="w-5 h-5 text-theme-text-primary" />,
    description: "配置 Agent 变量和设置",
    getSummary: (config) => {
      const varCount = config.variables?.filter((v) => v.name)?.length || 0;
      return `已定义 ${varCount} 个变量`;
    },
  },
  [BLOCK_TYPES.API_CALL]: {
    label: "API 调用",
    icon: <Globe className="w-5 h-5 text-theme-text-primary" />,
    description: "发起 HTTP 请求",
    defaultConfig: {
      url: "",
      method: "GET",
      headers: [],
      bodyType: "json",
      body: "",
      formData: [],
      responseVariable: "",
      directOutput: false,
    },
    getSummary: (config) =>
      `${config.method || "GET"} ${config.url || "(无 URL)"}`,
  },
  [BLOCK_TYPES.LLM_INSTRUCTION]: {
    label: "LLM 指令",
    icon: <Brain className="w-5 h-5 text-theme-text-primary" />,
    description: "使用 LLM 指令处理数据",
    defaultConfig: {
      instruction: "",
      resultVariable: "",
      directOutput: false,
    },
    getSummary: (config) => config.instruction || "无指令",
  },
  [BLOCK_TYPES.WEB_SCRAPING]: {
    label: "网页抓取",
    icon: <Browser className="w-5 h-5 text-theme-text-primary" />,
    description: "从网页抓取内容",
    defaultConfig: {
      url: "",
      captureAs: "text",
      querySelector: "",
      resultVariable: "",
      directOutput: false,
    },
    getSummary: (config) => config.url || "未指定 URL",
  },
  [BLOCK_TYPES.FINISH]: {
    label: "流程完成",
    icon: <Flag className="w-4 h-4" />,
    description: "Agent 流程结束",
    getSummary: () => "流程将在此结束",
    defaultConfig: {},
    renderConfig: () => null,
  },
};

/**
 * 获取 block 信息，如果类型未知则返回默认值
 * @param {string} blockType - block 类型
 * @returns {object} block 信息对象
 */
const getBlockInfo = (blockType) => {
  if (isUnsupportedBlockType(blockType)) {
    return {
      label: `不支持: ${blockType}`,
      icon: <Info className="w-5 h-5 text-theme-text-primary" />,
      description: "保留原始数据",
      defaultConfig: {},
      getSummary: () => "只读保留",
    };
  }

  return (
    BLOCK_INFO[blockType] || {
      label: `未知类型: ${blockType}`,
      icon: <Info className="w-5 h-5 text-theme-text-primary" />,
      description: "未知的 block 类型",
      defaultConfig: {},
      getSummary: () => "未知类型",
    }
  );
};

export default function BlockList({
  blocks,
  updateBlockConfig,
  removeBlock,
  toggleBlockExpansion,
  renderVariableSelect,
  onDeleteVariable,
  moveBlock,
  refs,
}) {
  const renderBlockConfig = (block) => {
    const isLastConfigurableBlock = blocks[blocks.length - 2]?.id === block.id;
    const supportsDirectOutput =
      Boolean(BLOCK_INFO[block.type]) &&
      block.type !== BLOCK_TYPES.START &&
      block.type !== BLOCK_TYPES.FLOW_INFO &&
      block.type !== BLOCK_TYPES.FINISH;
    const props = {
      config: block.config,
      onConfigChange: (config) => updateBlockConfig(block.id, config),
      renderVariableSelect,
      onDeleteVariable,
    };

    // Direct output switch to the last configurable block before finish
    if (isLastConfigurableBlock && supportsDirectOutput) {
      return (
        <div className="space-y-4">
          {renderBlockConfigContent(block, props)}
          <div className="flex justify-between items-center pt-4 border-t border-theme-border">
            <div>
              <label className="block text-sm font-medium text-theme-text-primary">
                直接输出
              </label>
              <p className="text-xs text-theme-text-secondary">
                此模块的输出将直接返回到聊天界面。
                <br />
                这将阻止后续工具调用的执行。
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={props.config.directOutput || false}
                onChange={(e) =>
                  props.onConfigChange({
                    ...props.config,
                    directOutput: e.target.checked,
                  })
                }
                className="peer sr-only"
                aria-label="Toggle direct output"
              />
              <div className="pointer-events-none peer h-6 w-11 rounded-full bg-[#CFCFD0] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:shadow-xl after:border-none after:bg-white after:box-shadow-md after:transition-all after:content-[''] peer-checked:bg-[#32D583] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-transparent"></div>
            </label>
          </div>
        </div>
      );
    }

    return renderBlockConfigContent(block, props);
  };

  const renderBlockConfigContent = (block, props) => {
    switch (block.type) {
      case BLOCK_TYPES.FLOW_INFO:
        return <FlowInfoNode {...props} ref={refs} />;
      case BLOCK_TYPES.START:
        return <StartNode {...props} />;
      case BLOCK_TYPES.API_CALL:
        return <ApiCallNode {...props} />;
      case BLOCK_TYPES.LLM_INSTRUCTION:
        return <LLMInstructionNode {...props} />;
      case BLOCK_TYPES.WEB_SCRAPING:
        return <WebScrapingNode {...props} />;
      case BLOCK_TYPES.FINISH:
        return <FinishNode />;
      default:
        return (
          <UnsupportedBlock
            blockType={block.type}
            blockData={block.data ?? block.config}
          />
        );
    }
  };

  return (
    <div className="space-y-1">
      {blocks.map((block, index) => (
        <div key={block.id} className="flex flex-col">
          <div
            className={`bg-theme-action-menu-bg border border-theme-border rounded-lg overflow-hidden transition-all duration-300 ${
              block.isExpanded ? "w-full" : "w-[280px] mx-auto"
            }`}
          >
            <div
              onClick={() => toggleBlockExpansion(block.id)}
              className="w-full p-4 flex items-center justify-between hover:bg-theme-action-menu-item-hover transition-colors duration-300 group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/10 light:bg-white flex items-center justify-center">
                  {React.cloneElement(getBlockInfo(block.type).icon, {
                    className: "w-4 h-4 text-theme-text-primary",
                  })}
                </div>
                <div className="flex-1 text-left min-w-0 max-w-[115px]">
                  <span className="text-sm font-medium text-theme-text-primary block">
                    {getBlockInfo(block.type).label}
                  </span>
                  {!block.isExpanded && (
                    <p className="text-xs text-white/60 truncate">
                      {getBlockInfo(block.type).getSummary(block.config)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center">
                {block.id !== "start" &&
                  block.type !== BLOCK_TYPES.FINISH &&
                  block.type !== BLOCK_TYPES.FLOW_INFO && (
                    <div className="flex items-center gap-1">
                      {index > 2 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveBlock(index, index - 1);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-theme-bg-primary border border-white/5 text-theme-text-primary hover:bg-theme-action-menu-item-hover transition-colors duration-300"
                          data-tooltip-id="block-action"
                          data-tooltip-content="上移模块"
                        >
                          <CaretUp className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {index < blocks.length - 2 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveBlock(index, index + 1);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-theme-bg-primary border border-white/5 text-theme-text-primary hover:bg-theme-action-menu-item-hover transition-colors duration-300"
                          data-tooltip-id="block-action"
                          data-tooltip-content="下移模块"
                        >
                          <CaretDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBlock(block.id);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-theme-bg-primary border border-white/5 text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-colors duration-300"
                        data-tooltip-id="block-action"
                        data-tooltip-content="删除模块"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
              </div>
            </div>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                block.isExpanded
                  ? "max-h-[1000px] opacity-100"
                  : "max-h-0 opacity-0"
              }`}
            >
              <div className="border-t border-theme-border p-4 bg-theme-bg-secondary rounded-b-lg">
                {renderBlockConfig(block)}
              </div>
            </div>
          </div>
          {index < blocks.length - 1 && (
            <div className="flex justify-center my-1">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-white/40 light:invert"
              >
                <path
                  d="M12 4L12 20M12 20L6 14M12 20L18 14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
        </div>
      ))}
      <Tooltip
        id="block-action"
        place="bottom"
        delayShow={300}
        className="tooltip !text-xs"
      />
    </div>
  );
}

export { BLOCK_TYPES, BLOCK_INFO };
