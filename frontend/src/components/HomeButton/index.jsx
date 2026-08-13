import paths from "@/utils/paths";
import { House } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

/**
 * HomeButton 组件 - 返回工作区首页
 * 显示在侧边栏底部，用于快速返回工作区列表
 */
export default function HomeButton() {
  return (
    <div className="flex w-fit">
      <Link
        to={paths.home()}
        className="transition-all duration-300 p-2 rounded-full bg-theme-sidebar-footer-icon hover:bg-theme-sidebar-footer-icon-hover"
        aria-label="Home"
        data-tooltip-id="footer-item"
        data-tooltip-content="返回工作区 / Back to workspaces"
      >
        <House
          className="h-5 w-5"
          weight="fill"
          color="var(--theme-sidebar-footer-icon-fill)"
        />
      </Link>
    </div>
  );
}
