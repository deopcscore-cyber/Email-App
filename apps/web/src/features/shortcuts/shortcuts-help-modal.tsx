"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useUi } from "@/contexts/ui-context";
import { fadeUp, popIn, staggerChildren } from "@/lib/motion";
import { useOverlayScope, useShortcut } from "./use-shortcut";

const SECTIONS: { title: string; shortcuts: [string, string][] }[] = [
  {
    title: "Navigation",
    shortcuts: [
      ["j / k", "Next / previous email"],
      ["Enter / o", "Open email"],
      ["Esc", "Back to list"],
      ["⌘K or /", "Command palette"],
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      ["c", "Compose"],
      ["e", "Archive"],
      ["#", "Delete"],
      ["s", "Star / unstar"],
      ["u", "Mark unread"],
    ],
  },
  {
    title: "Panels",
    shortcuts: [
      ["⌘J", "Toggle AI panel"],
      ["?", "This help"],
    ],
  },
];

export function ShortcutsHelpModal() {
  const { helpOpen, setHelpOpen } = useUi();
  useOverlayScope(helpOpen);
  useShortcut("escape", () => setHelpOpen(false), {
    scope: "overlay",
    enabled: helpOpen,
  });

  return (
    <AnimatePresence>
      {helpOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => setHelpOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-label="Keyboard shortcuts"
            variants={popIn}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="w-[480px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center">
              <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setHelpOpen(false)}
                className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <motion.div
              variants={staggerChildren(0.05)}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 gap-6 max-md:grid-cols-1"
            >
              {SECTIONS.map((section) => (
                <motion.div key={section.title} variants={fadeUp}>
                  <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </h3>
                  <dl className="space-y-1.5">
                    {section.shortcuts.map(([keys, description]) => (
                      <div
                        key={keys}
                        className="flex items-center gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-surface-muted"
                      >
                        <dt>
                          <kbd className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-sans text-[11px]">
                            {keys}
                          </kbd>
                        </dt>
                        <dd className="text-xs text-foreground/80">
                          {description}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
