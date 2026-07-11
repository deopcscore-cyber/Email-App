"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useCannedResponses } from "@/features/canned-responses/use-canned-responses";
import { popIn } from "@/lib/motion";

interface CannedResponseMenuProps {
  onInsert: (bodyHtml: string) => void;
}

/** Inserts a saved snippet into the compose body — same popover pattern
 * as RewriteMenu, appends rather than replaces. */
export function CannedResponseMenu({ onInsert }: CannedResponseMenuProps) {
  const [open, setOpen] = useState(false);
  const { data: responses } = useCannedResponses();

  return (
    <div className="relative">
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Insert canned response"
        title="Insert canned response"
        className="flex items-center gap-1.5 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <ClipboardList className="size-4" aria-hidden />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={popIn}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ transformOrigin: "bottom left" }}
            className="absolute bottom-11 left-0 z-20 w-64 rounded-xl border border-border bg-surface p-2 shadow-2xl"
          >
            <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Canned responses
            </p>
            {responses !== undefined && responses.length === 0 ? (
              <p className="px-1 py-2 text-[12px] text-muted-foreground">
                None yet.{" "}
                <Link
                  href="/settings/canned-responses"
                  className="text-accent hover:underline"
                >
                  Create one
                </Link>
              </p>
            ) : (
              <ul className="flex max-h-56 flex-col overflow-y-auto">
                {responses?.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onInsert(r.bodyHtml);
                        setOpen(false);
                      }}
                      className="w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-muted"
                    >
                      {r.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
