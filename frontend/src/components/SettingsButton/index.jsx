import useUser from "@/hooks/useUser";
import paths from "@/utils/paths";
import { preloadRoute } from "@/utils/settingsRoutePreload";
import { ArrowUUpLeft, Wrench } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useMatch } from "react-router-dom";

export default function SettingsButton() {
  const isInSettings = !!useMatch("/settings/*");
  const { user } = useUser();

  if (user && user?.role === "default") return null;

  if (isInSettings)
    return (
      <div className="flex w-fit">
        <Link
          to={paths.home()}
          onFocus={() => preloadRoute(paths.home())}
          onMouseEnter={() => preloadRoute(paths.home())}
          onPointerDown={() => preloadRoute(paths.home())}
          onTouchStart={() => preloadRoute(paths.home())}
          className="transition-all duration-300 p-2 rounded-full bg-theme-sidebar-footer-icon hover:bg-theme-sidebar-footer-icon-hover"
          aria-label="Home"
          data-tooltip-id="footer-item"
          data-tooltip-content="Back to workspaces"
        >
          <ArrowUUpLeft
            className="h-5 w-5"
            weight="fill"
            color="var(--theme-sidebar-footer-icon-fill)"
          />
        </Link>
      </div>
    );

  return (
    <div className="flex w-fit">
      <Link
        to={paths.settings.interface()}
        onFocus={() => preloadRoute(paths.settings.interface())}
        onMouseEnter={() => preloadRoute(paths.settings.interface())}
        onPointerDown={() => preloadRoute(paths.settings.interface())}
        onTouchStart={() => preloadRoute(paths.settings.interface())}
        className="transition-all duration-300 p-2 rounded-full bg-theme-sidebar-footer-icon hover:bg-theme-sidebar-footer-icon-hover"
        aria-label="Settings"
        data-tooltip-id="footer-item"
        data-tooltip-content="Open settings"
      >
        <Wrench
          className="h-5 w-5"
          weight="fill"
          color="var(--theme-sidebar-footer-icon-fill)"
        />
      </Link>
    </div>
  );
}
