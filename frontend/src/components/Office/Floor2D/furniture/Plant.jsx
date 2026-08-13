import { memo } from "react";

export const Plant = memo(function Plant({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx={0} cy={18} rx={16} ry={5} fill="#020511" opacity={0.22} />
      <circle cx={0} cy={-8} r={12} fill="#29f0c3" opacity={0.9} />
      <circle cx={-8} cy={0} r={10} fill="#1ecf8f" opacity={0.95} />
      <circle cx={8} cy={0} r={10} fill="#2ee6ff" opacity={0.75} />
      <rect x={-8} y={8} width={16} height={12} rx={3} fill="#7c3d18" />
    </g>
  );
});
