"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { useTriageThread } from "@/features/mail-list/hooks/use-threads";

export function snoozePresets(): { label: string; hint: string; at: Date }[] {
  const now = new Date();
  const laterToday = new Date(now.getTime() + 3 * 3600_000);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  const weekend = new Date(now);
  weekend.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
  weekend.setHours(8, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  nextWeek.setHours(8, 0, 0, 0);

  const fmt = (d: Date): string =>
    d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  return [
    { label: "Later today", hint: fmt(laterToday), at: laterToday },
    { label: "Tomorrow", hint: fmt(tomorrow), at: tomorrow },
    { label: "This weekend", hint: fmt(weekend), at: weekend },
    { label: "Next week", hint: fmt(nextWeek), at: nextWeek },
  ];
}

interface SnoozePopoverProps {
  threadId: string;
  open: boolean;
  onClose: () => void;
  onSnoozed?: () => void;
}

export function SnoozePopover({
  threadId,
  open,
  onClose,
  onSnoozed,
}: SnoozePopoverProps) {
  const triage = useTriageThread();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Click-away layer */}
          <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden />
          <motion.div
            role="menu"
            aria-label="Snooze until"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute left-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-2xl"
          >
            <p className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Clock className="size-3.5" aria-hidden />
              Snooze until
            </p>
            {snoozePresets().map(({ label, hint, at }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => {
                  triage.mutate(
                    { id: threadId, patch: { snoozedUntil: at.toISOString() } },
                    {
                      onSuccess: () => toast(`Snoozed until ${hint}`),
                    },
                  );
                  onClose();
                  onSnoozed?.();
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-[13px] hover:bg-surface-muted"
              >
                {label}
                <span className="text-[11px] text-muted-foreground">{hint}</span>
              </button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
