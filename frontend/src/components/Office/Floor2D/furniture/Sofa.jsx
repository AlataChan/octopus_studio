import { memo } from "react";
import { OFFICE_THEME } from "../../theme";

export const Sofa = memo(function Sofa({ x, y, isDark = false }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx={0} cy={22} rx={44} ry={10} fill="#020511" opacity={0.18} />
      <rect
        x={-42}
        y={-18}
        width={84}
        height={36}
        rx={10}
        fill={isDark ? "#3d1757" : "#d8b4fe"}
      />
      <rect
        x={-32}
        y={-32}
        width={64}
        height={16}
        rx={8}
        fill={isDark ? OFFICE_THEME.surface.magenta : "#c084fc"}
      />
    </g>
  );
});
