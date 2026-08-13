import { createContext, useContext, useMemo, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { OFFICE_THEME } from "../theme";

gsap.registerPlugin(useGSAP);

/**
 * Phase 1 foundation for the 2D living-floor motion system.
 *
 * Responsibilities:
 *  - Set project-wide GSAP defaults from the theme `motion` tokens (one consistent feel).
 *  - Track responsive / accessibility media state via `gsap.matchMedia()` and expose it
 *    as reactive flags so each animating component (avatar, link) can gate or kill its
 *    own perpetual loops. Because consumers read `reduceMotion` and re-run their
 *    `useGSAP` when it flips, switching reduced-motion ON tears existing loops down
 *    (not merely skips new ones) — per the Plan Review requirement.
 *
 * The flags are the source of truth for P2/P3 motion; this provider itself animates
 * nothing.
 */

const DEFAULT_FLAGS = { reduceMotion: false, isMobile: false };

const OfficeMotionContext = createContext({
  ...DEFAULT_FLAGS,
  tokens: OFFICE_THEME.motion,
});

export function useOfficeMotion() {
  return useContext(OfficeMotionContext);
}

export function OfficeMotionProvider({ children }) {
  const [flags, setFlags] = useState(DEFAULT_FLAGS);

  useGSAP(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const tokens = OFFICE_THEME.motion;
    gsap.defaults({
      duration: tokens.durations.base,
      ease: tokens.ease.out,
    });

    const mm = gsap.matchMedia();
    mm.add(
      {
        reduceMotion: "(prefers-reduced-motion: reduce)",
        isMobile: "(max-width: 768px)",
      },
      (context) => {
        const { reduceMotion, isMobile } = context.conditions;
        setFlags({
          reduceMotion: Boolean(reduceMotion),
          isMobile: Boolean(isMobile),
        });
      }
    );

    return () => mm.revert();
  }, []);

  const value = useMemo(
    () => ({
      reduceMotion: flags.reduceMotion,
      isMobile: flags.isMobile,
      tokens: OFFICE_THEME.motion,
    }),
    [flags.reduceMotion, flags.isMobile]
  );

  return (
    <OfficeMotionContext.Provider value={value}>
      {children}
    </OfficeMotionContext.Provider>
  );
}
