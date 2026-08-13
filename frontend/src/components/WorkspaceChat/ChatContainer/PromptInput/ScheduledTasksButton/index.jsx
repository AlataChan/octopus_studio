import { Clock } from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import { useNavigate } from "react-router-dom";
import paths from "@/utils/paths";

/**
 * 定时任务按钮 - 快速入口到定时任务管理
 * @param {Object} props
 * @param {string} props.workspaceSlug - 当前workspace的slug
 */
export default function ScheduledTasksButton({ workspaceSlug }) {
  const navigate = useNavigate();

  if (!workspaceSlug) return null;

  const handleClick = () => {
    navigate(paths.workspace.settings.scheduledTasks(workspaceSlug));
  };

  return (
    <button
      id="scheduled-tasks-btn"
      type="button"
      data-tooltip-id="tooltip-scheduled-tasks-btn"
      data-tooltip-content="定时任务"
      aria-label="定时任务"
      onClick={handleClick}
      className="flex justify-center items-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--theme-accent-primary)] rounded-lg transition-all duration-200"
    >
      <Clock
        color="var(--theme-sidebar-footer-icon-fill)"
        className="w-[22px] h-[22px] pointer-events-none text-theme-text-primary opacity-60 hover:opacity-100 light:opacity-100 light:hover:opacity-60"
      />
      <Tooltip
        id="tooltip-scheduled-tasks-btn"
        place="top"
        delayShow={300}
        className="allm-tooltip !allm-text-xs"
      />
    </button>
  );
}
