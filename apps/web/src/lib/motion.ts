import type { Transition, Variants } from "framer-motion";

/**
 * NovaMail's motion vocabulary — every animated surface draws from these so
 * the app moves as one system. Durations are short (the app should feel
 * fast, not animated); springs are reserved for surfaces that "arrive"
 * (modals, popovers).
 */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const; // expo-ish out

export const transitions = {
  /** Micro state changes: hovers, selection, icon swaps. */
  fast: { duration: 0.15, ease: EASE_OUT } satisfies Transition,
  /** Content appearing in place: cards, rows, panes. */
  enter: { duration: 0.25, ease: EASE_OUT } satisfies Transition,
  /** Surfaces arriving: modals, popovers, panels. */
  spring: {
    type: "spring",
    stiffness: 480,
    damping: 38,
    mass: 0.9,
  } satisfies Transition,
} as const;

/** Fade + rise, for content blocks. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: transitions.enter },
};

/** Container that staggers its fadeUp children. */
export const staggerChildren = (stagger = 0.045): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});

/** Popover/menu arrival. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  show: { opacity: 1, scale: 1, y: 0, transition: transitions.spring },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: transitions.fast },
};

/** Docked modal (compose) arrival. */
export const dockIn: Variants = {
  hidden: { opacity: 0, y: 32, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: transitions.spring },
  exit: { opacity: 0, y: 24, scale: 0.98, transition: transitions.fast },
};

/** List row exit (archive/delete swipe-out). */
export const rowExit = {
  opacity: 0,
  x: -32,
  transition: transitions.fast,
} as const;
