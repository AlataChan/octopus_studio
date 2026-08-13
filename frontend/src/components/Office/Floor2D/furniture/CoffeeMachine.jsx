import { memo } from "react";
import { OFFICE_THEME } from "../../theme";

export const CoffeeMachine = memo(function CoffeeMachine({
  x,
  y,
  isDark = false,
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx={0} cy={24} rx={20} ry={6} fill="#020511" opacity={0.2} />
      <rect
        x={-18}
        y={-22}
        width={36}
        height={44}
        rx={6}
        fill={isDark ? "#16233d" : "#e5e7eb"}
      />
      <rect
        x={-8}
        y={-12}
        width={16}
        height={12}
        rx={2}
        fill={isDark ? "#07101f" : "#111827"}
      />
      <circle cx={0} cy={10} r={4} fill={OFFICE_THEME.surface.orange} />
      <rect
        x={-11}
        y={-18}
        width={22}
        height={4}
        rx={2}
        fill={OFFICE_THEME.surface.cyan}
        opacity={isDark ? 0.75 : 0}
      />
    </g>
  );
});
