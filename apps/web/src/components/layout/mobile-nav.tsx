"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, PenLine } from "lucide-react";
import { transitions } from "@/lib/motion";
import { useUi } from "@/contexts/ui-context";
import { useCompose } from "@/features/compose/compose-context";
import { useSession } from "@/features/auth/use-session";
import { Sidebar } from "./sidebar";

/**
 * <768px chrome: a top bar (menu + compose) plus a slide-over drawer that
 * hosts the same Sidebar used on desktop -- folders, labels, accounts,
 * settings all live in one place instead of a stripped-down mobile menu.
 */
export function MobileNav() {
  const { mobileNavOpen, setMobileNavOpen } = useUi();
  const { openNew } = useCompose();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: user } = useSession();

  // Close the drawer whenever navigation happens (link taps inside it).
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  const activeAccountId = searchParams.get("account");
  const activeAccount = user?.accounts.find((a) => a.id === activeAccountId);
  // With a single connected account there's nothing to unify -- just show
  // its address, same as the filtered single-account case below.
  const soleAccount = user?.accounts.length === 1 ? user.accounts[0] : undefined;
  const headerLabel =
    (activeAccount ?? soleAccount)?.email ?? "All inboxes";

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <span className="min-w-0 truncate px-2 text-[13px] font-semibold tracking-tight">
          {headerLabel}
        </span>
        <button
          type="button"
          onClick={() => openNew()}
          aria-label="Compose"
          className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] text-white"
        >
          <PenLine className="size-4" aria-hidden />
        </button>
      </header>

      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transitions.fast}
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-black/50"
              aria-hidden
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={transitions.spring}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-chrome shadow-2xl"
            >
              <Sidebar collapsed={false} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
