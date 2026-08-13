import React from "react";
import {
  CheckCircle,
  ArrowSquareOut,
  DownloadSimple,
  Trash,
} from "@phosphor-icons/react";
import Button from "@/components/Button";

function badgeClass(kind) {
  if (kind === "builtin") return "bg-sky-400/10 text-sky-400";
  if (kind === "github") return "bg-purple-400/10 text-purple-400";
  if (kind === "community") return "bg-green-400/10 text-green-400";
  return "bg-theme-accent-primary/10 text-theme-accent-primary";
}

function sourceLabel(sourceType) {
  return String(sourceType);
}

export default function SkillCard({
  skill,
  installed = false,
  onView,
  onInstall,
  onUninstall,
  installing = false,
  uninstalling = false,
}) {
  const icon = skill?.icon || "🧩";
  const name = skill?.name || skill?.skillId || "Skill";
  const description = skill?.description || "";
  const category = skill?.category || "general";
  const sourceType = skill?.sourceType || skill?._source || "local";
  const tags = Array.isArray(skill?.tags) ? skill.tags : [];
  const visibleTags = tags.slice(0, 1);
  const remainingTagCount = Math.max(tags.length - 1, 0);

  return (
    <div className="group relative z-[1] flex h-full flex-col rounded-xl border-2 border-theme-sidebar-border bg-theme-bg-secondary p-3 transition-colors duration-300 hover:border-theme-accent-primary">
      <div className="mb-2.5 flex items-start gap-2.5">
        <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-lg bg-theme-accent-primary/10 text-xl">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[15px] font-bold text-theme-text-primary transition-colors group-hover:text-theme-accent-primary">
              {name}
            </h3>
            {installed && (
              <span className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[11px] text-green-400">
                <CheckCircle size={12} weight="fill" />
                已安装
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${badgeClass(sourceType)}`}
            >
              {sourceLabel(sourceType)}
            </span>
            <span className="rounded-md bg-theme-bg-container px-1.5 py-0.5 text-[11px] text-theme-text-secondary">
              {category}
            </span>
          </div>
        </div>
      </div>

      <p className="flex-grow line-clamp-2 text-[13px] leading-5 text-theme-text-secondary">
        {description}
      </p>

      {tags.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 overflow-hidden">
          {visibleTags.map((t, idx) => (
            <span
              key={`${t}-${idx}`}
              className="truncate rounded-md bg-theme-accent-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-theme-accent-primary"
            >
              {t}
            </span>
          ))}
          {remainingTagCount > 0 && (
            <span className="shrink-0 px-1 py-0.5 text-[11px] text-theme-text-secondary">
              +{remainingTagCount}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button className="flex-1" onClick={onView} size="sm" variant="sidebar">
          <ArrowSquareOut size={16} />
          详情
        </Button>

        {installed ? (
          <Button
            iconOnly
            onClick={onUninstall}
            disabled={uninstalling}
            size="sm"
            title="卸载/解绑"
            variant="danger"
          >
            <Trash size={16} />
          </Button>
        ) : (
          <Button
            iconOnly
            onClick={onInstall}
            disabled={installing}
            size="sm"
            title="安装"
          >
            <DownloadSimple size={16} weight="bold" />
          </Button>
        )}
      </div>
    </div>
  );
}
