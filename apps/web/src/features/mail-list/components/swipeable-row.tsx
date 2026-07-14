"use client";

import { useRef } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Archive, type LucideIcon, Trash2 } from "lucide-react";

const SWIPE_THRESHOLD = 84;

/**
 * Gmail-style swipe-to-triage for touch screens: drag right to archive
 * (or rescue from Spam, when `rightLabel`/`onSwipeRight` are overridden),
 * left to delete. `enabled` gates dragging (desktop passes false, so
 * this stays fully inert there -- no pointer/mouse drag on a feature meant
 * for touch). The row itself owns click-to-open; a drag that crosses the
 * threshold fires the action, and the click that the browser still sends
 * on release is swallowed via the capture-phase guard below, since without
 * it every completed swipe would also open the thread it just archived.
 */
export function SwipeableRow({
  children,
  enabled,
  onSwipeRight,
  onTrash,
  rightLabel = "Archive",
  RightIcon = Archive,
}: {
  children: React.ReactNode;
  enabled: boolean;
  onSwipeRight: () => void;
  onTrash: () => void;
  rightLabel?: string;
  RightIcon?: LucideIcon;
}) {
  const x = useMotionValue(0);
  const rightOpacity = useTransform(x, [12, SWIPE_THRESHOLD], [0, 1]);
  const trashOpacity = useTransform(x, [-SWIPE_THRESHOLD, -12], [1, 0]);
  const draggedRef = useRef(false);

  function handleDragEnd(_event: unknown, info: PanInfo): void {
    if (info.offset.x > SWIPE_THRESHOLD) {
      draggedRef.current = true;
      onSwipeRight();
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      draggedRef.current = true;
      onTrash();
    }
  }

  if (!enabled) return <>{children}</>;

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      onClickCapture={(e) => {
        if (draggedRef.current) {
          e.stopPropagation();
          draggedRef.current = false;
        }
      }}
    >
      <motion.div
        aria-hidden
        style={{ opacity: rightOpacity }}
        className="absolute inset-0 flex items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-medium text-white"
      >
        <RightIcon className="size-4" aria-hidden />
        {rightLabel}
      </motion.div>
      <motion.div
        aria-hidden
        style={{ opacity: trashOpacity }}
        className="absolute inset-0 flex items-center justify-end gap-2 rounded-xl bg-danger px-4 text-sm font-medium text-white"
      >
        Delete
        <Trash2 className="size-4" aria-hidden />
      </motion.div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        // Without this, the browser's own touch handling races Framer
        // Motion's for ownership of the gesture inside a vertically
        // scrollable list -- it can look like a swipe is happening (partial
        // movement renders) while the browser quietly cancels it as a
        // scroll attempt before a clean dragend ever fires, so the action
        // never triggers. This tells the browser vertical touch movement is
        // always native scrolling, leaving horizontal exclusively to us.
        style={{ x, touchAction: "pan-y" }}
        onDragEnd={handleDragEnd}
        className="relative bg-background"
      >
        {children}
      </motion.div>
    </div>
  );
}
