import React from "react";
import { useTranslation } from "react-i18next";
import { WarningCircle } from "@phosphor-icons/react";

export default function LLMProviderOverrideNotice({ overrides = [] }) {
  const { t } = useTranslation();
  const visibleOverrides = Array.isArray(overrides)
    ? overrides.filter((workspace) => workspace?.name)
    : [];

  if (visibleOverrides.length === 0) return null;

  return (
    <div
      data-testid="llm-provider-override-notice"
      className="mt-4 w-full max-w-[720px] rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <div className="flex items-start gap-x-3">
        <WarningCircle
          size={20}
          weight="fill"
          className="mt-[1px] flex-shrink-0 text-amber-300 light:text-amber-700"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-amber-100 light:text-amber-800">
            {t(
              "llm.override_notice.title",
              "Some workspaces use their own LLM provider"
            )}
          </p>
          <p className="mt-1 text-xs leading-[18px] text-amber-100/80 light:text-amber-900/80">
            {t(
              "llm.override_notice.action",
              "Open each workspace's Chat Settings to change its provider."
            )}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {visibleOverrides.map((workspace) => (
              <li
                key={workspace.id ?? workspace.name}
                className="max-w-full rounded-md border border-amber-400/20 bg-black/10 px-2 py-1 text-xs font-medium text-amber-50 light:bg-white/40 light:text-amber-900"
              >
                {workspace.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
