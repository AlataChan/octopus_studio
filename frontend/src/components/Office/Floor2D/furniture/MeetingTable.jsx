import { memo } from "react";
import { OFFICE_THEME } from "../../theme";

export const MeetingTable = memo(function MeetingTable({
  x,
  y,
  isDark = false,
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx={0} cy={18} rx={72} ry={14} fill="#020511" opacity={0.18} />
      <ellipse
        cx={0}
        cy={0}
        rx={70}
        ry={36}
        fill={isDark ? "#26170c" : "#e7d3a8"}
        stroke={isDark ? OFFICE_THEME.surface.orange : "#b0894f"}
        strokeWidth={2}
      />
      <ellipse cx={0} cy={-3} rx={56} ry={24} fill="rgba(255,255,255,0.04)" />
    </g>
  );
});
