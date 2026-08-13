import { useState, useEffect } from "react";
import { Wrench, CheckCircle, CircleNotch } from "@phosphor-icons/react";
import AgentStatus from "@/models/agentStatus";

/**
 * /tools Slash Command
 * 显示当前可用的 Agent 工具列表
 */
export default function ToolsCommand({ setShowing, sendCommand }) {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchTools() {
      setLoading(true);
      const response = await AgentStatus.getTools();
      if (response.success) {
        setTools(response.tools || []);
      }
      setLoading(false);
    }
    fetchTools();
  }, []);

  const enabledTools = tools.filter((t) => t.enabled);

  function handleClick() {
    // 发送工具列表到聊天
    const toolList = enabledTools.map((t) => `- ${t.name}`).join("\n");
    const message = `**当前可用的 Agent 工具 (${enabledTools.length}个)**:\n${toolList}`;
    sendCommand({ text: message, autoSubmit: false });
    setShowing(false);
  }

  return (
    <button
      type="button"
      data-slash-command="/tools"
      onClick={handleClick}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="border-none w-full hover:cursor-pointer hover:bg-theme-action-menu-item-hover px-2 py-2 rounded-xl flex flex-col justify-start"
    >
      <div className="w-full flex-col text-left flex pointer-events-none">
        <div className="flex items-center gap-x-2 text-theme-text-primary text-sm font-bold">
          <Wrench size={16} weight="duotone" className="text-purple-400" />
          /tools
          {loading ? (
            <CircleNotch
              size={14}
              className="animate-spin text-theme-text-secondary"
            />
          ) : (
            <span className="text-xs text-theme-text-secondary font-normal">
              ({enabledTools.length} 可用)
            </span>
          )}
        </div>
        <div className="text-theme-text-primary text-opacity-60 text-sm">
          查看当前可用的 Agent 工具列表
        </div>

        {/* 展开显示工具列表预览 */}
        {expanded && !loading && enabledTools.length > 0 && (
          <div className="mt-2 pt-2 border-t border-theme-border max-h-[150px] overflow-y-auto">
            <div className="grid grid-cols-2 gap-1">
              {enabledTools.slice(0, 8).map((tool, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-x-1 text-xs text-theme-text-secondary"
                >
                  <CheckCircle size={12} className="text-green-400" />
                  <span className="truncate">{tool.name}</span>
                </div>
              ))}
              {enabledTools.length > 8 && (
                <div className="text-xs text-theme-text-secondary opacity-70">
                  +{enabledTools.length - 8} 更多...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}
