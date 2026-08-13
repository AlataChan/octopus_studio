const STATUS_TONE_CLASSES = {
  success:
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 light:text-emerald-700 light:border-emerald-500/30",
  warning:
    "bg-amber-500/10 text-amber-300 border-amber-500/20 light:text-amber-700 light:border-amber-500/30",
  error:
    "bg-red-500/10 text-red-400 border-red-500/20 light:text-red-700 light:border-red-500/30",
  neutral:
    "bg-slate-500/10 text-theme-text-secondary border-slate-500/20 light:text-slate-600 light:border-slate-400/30",
};

function normalizeTone(value) {
  const normalized = String(value || "unknown").toLowerCase();

  if (["running", "active", "healthy"].includes(normalized)) return "success";
  if (["starting", "degraded", "review"].includes(normalized)) return "warning";
  if (normalized === "error") return "error";

  return "neutral";
}

export default function StatusBadge({ label, value }) {
  const tone = normalizeTone(value);
  const displayValue = label || value || "unknown";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${STATUS_TONE_CLASSES[tone]}`}
    >
      {displayValue}
    </span>
  );
}
