import Sidebar from "@/components/Sidebar";
import { useState } from "react";
import { isMobile } from "react-device-detect";
import GenerateView from "./GenerateView";
import JobsView from "./JobsView";
import StitchView from "./StitchView";

const TABS = [
  { key: "generate", label: "Generate", Component: GenerateView },
  { key: "jobs", label: "My Jobs", Component: JobsView },
  { key: "stitch", label: "Stitch", Component: StitchView },
];

export default function VisualProductionPage() {
  const [activeTab, setActiveTab] = useState("generate");
  const ActiveView =
    TABS.find((tab) => tab.key === activeTab)?.Component || GenerateView;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-page-texture">
      <Sidebar />
      <main
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] h-full w-full overflow-y-scroll bg-theme-bg-secondary md:my-[16px] md:ml-[2px] md:mr-[16px] md:rounded-[16px]"
      >
        <div className="flex w-full flex-col px-6 py-6">
          <div className="border-b-2 border-theme-border pb-6">
            <p className="text-2xl font-bold text-theme-text-primary">
              视觉生成
            </p>
            <p className="mt-2 text-sm text-theme-text-secondary">
              Generate images and videos through the local visual production
              sidecar.
            </p>
          </div>

          <div className="mt-6">
            <div className="mb-5 flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-primary)]"
                      : "border-theme-sidebar-border text-theme-text-secondary hover:bg-theme-bg-primary hover:text-theme-text-primary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <ActiveView />
          </div>
        </div>
      </main>
    </div>
  );
}
