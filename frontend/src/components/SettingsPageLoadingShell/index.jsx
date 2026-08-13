import SettingsSidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";

function SkeletonBlock({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-theme-bg-primary/70 ${className}`}
    />
  );
}

export default function SettingsPageLoadingShell({
  sidebar = <SettingsSidebar />,
  rootClassName = "w-screen h-screen overflow-hidden bg-page-texture flex md:mt-0 mt-6",
  contentClassName = "",
}) {
  return (
    <div className={rootClassName} data-testid="settings-page-loading-shell">
      {sidebar}
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className={`relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] w-full h-full overflow-hidden ${contentClassName}`}
      >
        <div className="flex h-full w-full flex-col gap-y-6 p-6 md:p-8">
          <div className="space-y-3">
            <SkeletonBlock className="h-7 w-56" />
            <SkeletonBlock className="h-4 w-full max-w-2xl" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
          </div>
          <SkeletonBlock className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
