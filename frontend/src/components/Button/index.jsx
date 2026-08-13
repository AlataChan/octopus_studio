import { SpinnerGap } from "@phosphor-icons/react";

const SIZE_CLASSES = {
  sm: "min-h-[34px] px-3 py-1.5 text-xs",
  md: "min-h-[40px] px-4 py-2 text-sm",
};

const ICON_ONLY_SIZE_CLASSES = {
  sm: "h-[34px] w-[34px] p-0",
  md: "h-[40px] w-[40px] p-0",
};

const VARIANT_CLASSES = {
  primary:
    "bg-primary-button text-[var(--theme-button-primary-text)] hover:bg-primary-button-hover",
  secondary:
    "border border-theme-sidebar-border bg-transparent text-theme-text-primary hover:bg-[var(--theme-button-secondary-hover-bg)]",
  danger:
    "border border-[var(--theme-button-danger-border)] bg-[var(--theme-button-danger-bg)] text-[var(--theme-button-danger-text)] hover:border-[var(--theme-button-danger-hover-border)] hover:bg-[var(--theme-button-danger-hover-bg)]",
  ghost:
    "bg-[var(--theme-button-ghost-bg)] text-theme-text-primary hover:bg-[var(--theme-button-ghost-hover-bg)]",
  // muted: text-only cancel button (no border, no bg) — for modal/dialog cancel actions
  muted:
    "bg-transparent text-[var(--theme-button-muted-text)] hover:text-[var(--theme-button-muted-hover-text)]",
  // sidebar: matches sidebar item default/hover bg — for action buttons inside sidebar-style panels
  sidebar:
    "bg-[var(--theme-button-sidebar-bg)] text-theme-text-primary hover:bg-[var(--theme-button-sidebar-hover-bg)]",
};

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export default function Button({
  as = "button",
  children,
  className = "",
  disabled = false,
  iconOnly = false,
  loading = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...rest
}) {
  const resolvedSize = SIZE_CLASSES[size] ? size : "md";
  const isButton = as !== "a";
  const isDisabled = isButton ? disabled || loading : false;

  const classes = classNames(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-secondary)]",
    VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary,
    iconOnly
      ? ICON_ONLY_SIZE_CLASSES[resolvedSize]
      : SIZE_CLASSES[resolvedSize],
    className
  );

  const content = (
    <>
      {loading && <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />}
      {children}
    </>
  );

  if (!isButton) {
    return (
      <a className={classes} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button
      aria-busy={loading ? "true" : undefined}
      className={classes}
      disabled={isDisabled}
      type={type}
      {...rest}
    >
      {content}
    </button>
  );
}
