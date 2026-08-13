import { memo } from "react";
import { Chair } from "./furniture/Chair";
import { Desk } from "./furniture/Desk";
import { OFFICE_THEME } from "../theme";

export const DeskUnit = memo(function DeskUnit({ x, y, actorName }) {
  const isDark = OFFICE_THEME.meta.isDark;

  return (
    <g>
      <ellipse
        cx={x}
        cy={y + 30}
        rx={48}
        ry={12}
        fill={OFFICE_THEME.floor.deskShadow}
        opacity={0.3}
      />
      <Desk x={x} y={y} isDark={isDark} />
      <Chair x={x} y={y + 40} isDark={isDark} />
      {actorName ? (
        <text
          x={x}
          y={y - 40}
          textAnchor="middle"
          fontSize={8}
          fontWeight="700"
          letterSpacing="0.6px"
          fill={OFFICE_THEME.surface.textMuted}
        >
          {actorName.length > 14 ? `${actorName.slice(0, 14)}...` : actorName}
        </text>
      ) : null}
    </g>
  );
});
