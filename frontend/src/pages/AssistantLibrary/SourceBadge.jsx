import React from "react";

export default function SourceBadge({ source }) {
  if (!source || source.type !== "markdown") return null;

  return (
    <div className="mt-4 flex items-center gap-2 border-t border-theme-sidebar-border pt-3 text-[11px] text-theme-text-secondary">
      <span className="opacity-70">Source:</span>
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-theme-accent-primary"
        >
          agency-agents
        </a>
      ) : (
        <span>agency-agents</span>
      )}
      {source.license && (
        <span className="rounded bg-theme-bg-container px-1.5 py-0.5">
          {source.license}
        </span>
      )}
      {source.commit && (
        <span className="font-mono opacity-70">
          @{String(source.commit).slice(0, 7)}
        </span>
      )}
    </div>
  );
}
