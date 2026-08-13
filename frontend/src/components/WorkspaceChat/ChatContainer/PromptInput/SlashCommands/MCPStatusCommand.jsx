import { useState, useEffect } from "react";
import { PlugsConnected, Circle, CircleNotch } from "@phosphor-icons/react";
import AgentStatus from "@/models/agentStatus";

/**
 * /mcp status Slash Command
 * 显示 MCP 服务器状态
 */
export default function MCPStatusCommand({ setShowing, sendCommand }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchMCPStatus() {
      setLoading(true);
      const response = await AgentStatus.getMCPStatus();
      if (response.success) {
        setServers(response.servers || []);
      }
      setLoading(false);
    }
    fetchMCPStatus();
  }, []);

  const runningServers = servers.filter((s) => s.running);

  function handleClick() {
    // 发送 MCP 状态到聊天
    if (servers.length === 0) {
      sendCommand({ text: "**没有配置 MCP 服务器**", autoSubmit: false });
    } else {
      const serverList = servers
        .map(
          (s) =>
            `- **${s.name}** [${s.running ? "🟢 运行中" : "🔴 已停止"}] - ${s.transport} (${s.toolCount} 工具)`
        )
        .join("\n");
      const message = `**MCP 服务器状态 (${runningServers.length}/${servers.length} 运行中)**:\n${serverList}`;
      sendCommand({ text: message, autoSubmit: false });
    }
    setShowing(false);
  }

  return (
    <button
      type="button"
      data-slash-command="/mcp"
      onClick={handleClick}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="border-none w-full hover:cursor-pointer hover:bg-theme-action-menu-item-hover px-2 py-2 rounded-xl flex flex-col justify-start"
    >
      <div className="w-full flex-col text-left flex pointer-events-none">
        <div className="flex items-center gap-x-2 text-theme-text-primary text-sm font-bold">
          <PlugsConnected
            size={16}
            weight="duotone"
            className="text-green-400"
          />
          /mcp status
          {loading ? (
            <CircleNotch
              size={14}
              className="animate-spin text-theme-text-secondary"
            />
          ) : (
            <span className="text-xs text-theme-text-secondary font-normal">
              ({runningServers.length}/{servers.length} 运行中)
            </span>
          )}
        </div>
        <div className="text-theme-text-primary text-opacity-60 text-sm">
          查看 MCP 服务器连接状态
        </div>

        {/* 展开显示服务器列表预览 */}
        {expanded && !loading && servers.length > 0 && (
          <div className="mt-2 pt-2 border-t border-theme-border max-h-[150px] overflow-y-auto">
            <div className="space-y-1">
              {servers.slice(0, 5).map((server, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-x-2 text-xs text-theme-text-secondary"
                >
                  <Circle
                    size={8}
                    weight="fill"
                    className={
                      server.running ? "text-green-400" : "text-red-400"
                    }
                  />
                  <span
                    className={`truncate ${!server.running ? "opacity-50" : ""}`}
                  >
                    {server.name}
                  </span>
                  <span className="text-theme-text-secondary opacity-70">
                    [{server.transport}] {server.toolCount} 工具
                  </span>
                </div>
              ))}
              {servers.length > 5 && (
                <div className="text-xs text-theme-text-secondary opacity-70">
                  +{servers.length - 5} 更多...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}
