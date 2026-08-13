import { memo } from "react";

export const Chair = memo(function Chair({ x, y, isDark = false }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx={0} cy={8} rx={16} ry={6} fill="#020511" opacity={0.24} />
      <rect
        x={-16}
        y={-10}
        width={32}
        height={20}
        rx={8}
        fill={isDark ? "#49627f" : "#94a3b8"}
      />
      <rect
        x={-12}
        y={-18}
        width={24}
        height={8}
        rx={4}
        fill={isDark ? "#1d3150" : "#cbd5e1"}
      />
    </g>
  );
});
