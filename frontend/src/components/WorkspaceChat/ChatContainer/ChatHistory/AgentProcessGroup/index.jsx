import { useState } from "react";
import { CaretDown, CircleNotch, Robot } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import StatusResponse from "../StatusResponse";
import FlowProgress from "../FlowProgress";
import AgentTaskListMessage from "../AgentTaskListMessage";

/**
 * ReasoningBlock — collapsed "💭 推理" section inside the process group.
 * Renders the accumulated reasoning text in a scrollable pre-formatted block.
 * Defaults to collapsed; click the header to toggle.
 */
function ReasoningBlock({ content = "", truncated = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col rounded border border-theme-border overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-x-2 px-3 py-1.5 bg-theme-bg-chat-input hover:bg-theme-sidebar-item-hover transition-colors cursor-pointer text-left"
      >
        <span className="text-base leading-none select-none">💭</span>
        <span className="flex-1 min-w-0 truncate text-theme-text-secondary font-mono">
          {t("chat_window.reasoning_section")}
          {truncated && (
            <span className="ml-2 text-xs opacity-60">
              {t("chat_window.reasoning_truncated")}
            </span>
          )}
        </span>
        <CaretDown
          className={`w-3.5 h-3.5 flex-shrink-0 text-theme-text-secondary transform transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-3 py-2 bg-theme-bg-secondary max-h-64 overflow-y-auto">
          <pre className="whitespace-pre-wrap break-words text-xs text-theme-text-secondary font-mono leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * AgentProcessGroup
 *
 * Collapses the whole contiguous run of agent "process" blocks (thinking /
 * status, planning task list, tool calls, flow progress) into a SINGLE
 * one-line summary that is collapsed by default. While the turn is active the
 * summary shows the latest live status so the user still sees progress; once
 * finished it shows a static label. Clicking expands the original detail
 * blocks unchanged.
 *
 * @param {Object} props
 * @param {Array<{kind: "status"|"flow"|"taskList", payload: any}>} props.items
 * @param {boolean} props.isActive - turn is still streaming
 */
export default function AgentProcessGroup({ items = [], isActive = false }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!items.length) return null;

  // Live summary while active: latest status message content.
  let liveLabel = "";
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === "status") {
      const arr = items[i].payload || [];
      liveLabel = arr.length ? String(arr[arr.length - 1]?.content || "") : "";
      break;
    }
  }
  const summary =
    isActive && liveLabel ? liveLabel : t("chat_window.agent_process_summary");

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-[80%] flex flex-col">
        <div
          onClick={() => setExpanded((v) => !v)}
          style={{ borderRadius: "6px" }}
          className="items-center bg-theme-bg-chat-input py-1.5 px-3 flex gap-x-2 cursor-pointer hover:bg-theme-sidebar-item-hover transition-colors"
        >
          <div className="w-5 h-5 flex justify-center flex-shrink-0 items-center text-theme-text-secondary">
            {isActive ? (
              <CircleNotch className="w-4 h-4 animate-spin" />
            ) : (
              <Robot className="w-4 h-4" />
            )}
          </div>
          <span className="flex-1 min-w-0 truncate text-theme-text-secondary text-sm font-mono">
            {summary}
          </span>
          <CaretDown
            className={`w-4 h-4 flex-shrink-0 text-theme-text-secondary transform transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </div>

        {expanded && (
          <div className="flex flex-col gap-y-2 mt-2">
            {items.map((item, idx) => {
              if (item.kind === "status")
                return (
                  <StatusResponse
                    key={`pg-status-${idx}`}
                    messages={item.payload}
                    isThinking={false}
                  />
                );
              if (item.kind === "flow")
                return (
                  <FlowProgress key={`pg-flow-${idx}`} progress={item.payload} />
                );
              if (item.kind === "taskList")
                return (
                  <AgentTaskListMessage
                    key={`pg-task-${idx}`}
                    taskList={item.payload}
                  />
                );
              if (item.kind === "reasoning")
                return (
                  <ReasoningBlock
                    key={`pg-reasoning-${idx}`}
                    content={item.payload?.content || ""}
                    truncated={!!item.payload?.truncated}
                  />
                );
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
