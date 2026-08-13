import React, { useState } from "react";

import JobsBoard from "./components/JobsBoard";
import SchedulerPanel from "./components/SchedulerPanel";
import MemoryPanel from "./components/MemoryPanel";
import TeamPanel from "./components/TeamPanel";
import OfficePanel from "./components/OfficePanel";

export default function MissionControl({
  workspaceId,
  skillById,
  assistants,
  installations,
}) {
  const [active, setActive] = useState("tasks"); // tasks | calendar | memory | team | office

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActive("tasks")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            active === "tasks"
              ? "bg-theme-accent-primary/10 text-theme-accent-primary"
              : "bg-theme-sidebar-item-default text-white/80 hover:text-theme-text-primary hover:bg-theme-sidebar-item-hover"
          }`}
        >
          Tasks
        </button>
        <button
          onClick={() => setActive("calendar")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            active === "calendar"
              ? "bg-theme-accent-primary/10 text-theme-accent-primary"
              : "bg-theme-sidebar-item-default text-white/80 hover:text-theme-text-primary hover:bg-theme-sidebar-item-hover"
          }`}
        >
          Calendar
        </button>
        <button
          onClick={() => setActive("memory")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            active === "memory"
              ? "bg-theme-accent-primary/10 text-theme-accent-primary"
              : "bg-theme-sidebar-item-default text-white/80 hover:text-theme-text-primary hover:bg-theme-sidebar-item-hover"
          }`}
        >
          Memory
        </button>
        <button
          onClick={() => setActive("team")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            active === "team"
              ? "bg-theme-accent-primary/10 text-theme-accent-primary"
              : "bg-theme-sidebar-item-default text-white/80 hover:text-theme-text-primary hover:bg-theme-sidebar-item-hover"
          }`}
        >
          Team
        </button>
        <button
          onClick={() => setActive("office")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            active === "office"
              ? "bg-theme-accent-primary/10 text-theme-accent-primary"
              : "bg-theme-sidebar-item-default text-white/80 hover:text-theme-text-primary hover:bg-theme-sidebar-item-hover"
          }`}
        >
          Office
        </button>
      </div>

      {active === "tasks" && (
        <JobsBoard workspaceId={workspaceId} skillById={skillById} />
      )}

      {active === "calendar" && <SchedulerPanel />}

      {active === "memory" && (
        <MemoryPanel workspaceId={workspaceId} skillById={skillById} />
      )}

      {active === "team" && (
        <TeamPanel
          workspaceId={workspaceId}
          assistants={assistants}
          installations={installations}
          skillById={skillById}
        />
      )}

      {active === "office" && (
        <OfficePanel
          workspaceId={workspaceId}
          assistants={assistants}
          installations={installations}
          skillById={skillById}
        />
      )}

      {active !== "tasks" &&
        active !== "calendar" &&
        active !== "memory" &&
        active !== "team" &&
        active !== "office" && (
          <div className="text-theme-text-secondary text-sm">
            Coming soon: {active}
          </div>
        )}
    </div>
  );
}
