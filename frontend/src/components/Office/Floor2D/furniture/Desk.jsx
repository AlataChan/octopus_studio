import { memo } from "react";
import { OFFICE_THEME } from "../../theme";

export const Desk = memo(function Desk({ x, y, isDark = false }) {
  const surface = isDark ? "#132745" : "#dfe5ed";
  const edge = isDark ? "#284e7f" : "#bcc5d3";

  return (
    <g transform={`translate(${x},${y})`}>
      <rect
        x={-48}
        y={-32}
        width={96}
        height={64}
        rx={14}
        fill="rgba(46,230,255,0.06)"
        opacity={isDark ? 1 : 0}
      />
      <rect
        x={-50}
        y={-30}
        width={100}
        height={60}
        rx={10}
        fill={surface}
        stroke={edge}
        strokeWidth={1.5}
      />
      <rect
        x={-46}
        y={-26}
        width={92}
        height={14}
        rx={7}
        fill="rgba(255,255,255,0.04)"
      />
      <rect
        x={-20}
        y={-22}
        width={40}
        height={24}
        rx={5}
        fill={isDark ? "#07101f" : "#1e293b"}
      />
      <rect x={-5} y={2} width={10} height={6} rx={2} fill={edge} />
      <rect
        x={-16}
        y={12}
        width={32}
        height={8}
        rx={4}
        fill={edge}
        opacity={0.55}
      />
      <rect
        x={-36}
        y={18}
        width={10}
        height={3}
        rx={1.5}
        fill={OFFICE_THEME.surface.cyan}
        opacity={isDark ? 0.8 : 0}
      />
    </g>
  );
});
