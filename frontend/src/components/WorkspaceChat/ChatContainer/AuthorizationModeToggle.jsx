import React, { useId } from "react";
import { ShieldCheck, ShieldWarning } from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import { useTranslation } from "react-i18next";

export default function AuthorizationModeToggle({
  value = "hitl",
  onChange,
  isAdmin = false,
}) {
  const { t } = useTranslation();
  const idPrefix = useId();
  const mode = value === "full_authorize" ? "full_authorize" : "hitl";

  const Btn = ({ id, label, icon: Icon, disabled }) => {
    const active = mode === id;
    const tooltipId = `${idPrefix}-auth-mode-tooltip-${id}`;

    return (
      <span className="inline-flex" data-tooltip-id={tooltipId}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange?.(id)}
          className={`px-3 py-1.5 text-xs rounded-md inline-flex items-center gap-2 transition-colors ${
            active
              ? "bg-theme-accent-primary/25 text-theme-accent-primary"
              : "text-theme-text-secondary hover:bg-theme-sidebar-item-hover"
          } ${disabled ? "opacity-40 cursor-not-allowed hover:bg-transparent" : ""}`}
        >
          <Icon size={14} weight="fill" />
          {label}
        </button>
        <Tooltip
          id={tooltipId}
          place="top"
          delayShow={300}
          className="tooltip !text-xs z-99"
          content={
            disabled && id === "full_authorize"
              ? t("chat_window.authorization.disabled.tooltip")
              : id === "hitl"
                ? t("chat_window.authorization.hitl.tooltip")
                : t("chat_window.authorization.full.tooltip")
          }
        />
      </span>
    );
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-2 flex items-center justify-between">
      <div className="text-[10px] text-theme-text-secondary">
        {t("chat_window.authorization.label")}
      </div>
      <div className="inline-flex items-center gap-1 bg-theme-bg-secondary border border-theme-border rounded-lg p-1">
        <Btn id="hitl" label="HITL" icon={ShieldWarning} disabled={false} />
        <Btn
          id="full_authorize"
          label="FULL"
          icon={ShieldCheck}
          disabled={!isAdmin}
        />
      </div>
    </div>
  );
}
