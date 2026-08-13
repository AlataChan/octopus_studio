import { useState, useEffect } from "react";
import { GitBranch, Play, Pause, CircleNotch } from "@phosphor-icons/react";
import AgentStatus from "@/models/agentStatus";

/**
 * /flow list Slash Command
 * 显示已激活的 Agent Flow 列表
 */
export default function FlowCommand({ setShowing, sendCommand }) {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchFlows() {
      setLoading(true);
      const response = await AgentStatus.getFlows();
      if (response.success) {
        setFlows(response.flows || []);
      }
      setLoading(false);
    }
    fetchFlows();
  }, []);

  const activeFlows = flows.filter((f) => f.active);

  function handleClick() {
    // 发送 Flow 列表到聊天
    if (activeFlows.length === 0) {
      sendCommand({ text: "**当前没有激活的 Agent Flow**", autoSubmit: false });
    } else {
      const flowList = activeFlows
        .map((f) => `- **${f.name}** (${f.blockCount} 个步骤)`)
        .join("\n");
      const message = `**已激活的 Agent Flow (${activeFlows.length}个)**:\n${flowList}`;
      sendCommand({ text: message, autoSubmit: false });
    }
    setShowing(false);
  }

  return (
    <button
      type="button"
      data-slash-command="/flow"
      onClick={handleClick}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="border-none w-full hover:cursor-pointer hover:bg-theme-action-menu-item-hover px-2 py-2 rounded-xl flex flex-col justify-start"
    >
      <div className="w-full flex-col text-left flex pointer-events-none">
        <div className="flex items-center gap-x-2 text-theme-text-primary text-sm font-bold">
          <GitBranch size={16} weight="duotone" className="text-blue-400" />
          /flow list
          {loading ? (
            <CircleNotch
              size={14}
              className="animate-spin text-theme-text-secondary"
            />
          ) : (
            <span className="text-xs text-theme-text-secondary font-normal">
              ({activeFlows.length} 激活)
            </span>
          )}
        </div>
        <div className="text-theme-text-primary text-opacity-60 text-sm">
          查看已激活的 Agent Flow 工作流列表
        </div>

        {/* 展开显示 Flow 列表预览 */}
        {expanded && !loading && flows.length > 0 && (
          <div className="mt-2 pt-2 border-t border-theme-border max-h-[150px] overflow-y-auto">
            <div className="space-y-1">
              {flows.slice(0, 5).map((flow, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-x-2 text-xs text-theme-text-secondary"
                >
                  {flow.active ? (
                    <Play size={12} className="text-green-400" />
                  ) : (
                    <Pause size={12} className="text-theme-text-secondary" />
                  )}
                  <span
                    className={`truncate ${!flow.active ? "opacity-50" : ""}`}
                  >
                    {flow.name}
                  </span>
                  <span className="text-theme-text-secondary opacity-70">({flow.blockCount} 步)</span>
                </div>
              ))}
              {flows.length > 5 && (
                <div className="text-xs text-theme-text-secondary opacity-70">
                  +{flows.length - 5} 更多...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}
