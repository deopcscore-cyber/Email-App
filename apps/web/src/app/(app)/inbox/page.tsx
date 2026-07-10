"use client";

import { motion } from "framer-motion";
import { LogOut, Mail, Plus } from "lucide-react";
import { linkAccountUrl } from "@/features/auth/api";
import { useLogout, useSession } from "@/features/auth/use-session";

/**
 * Phase 2 placeholder: proves the full auth loop (session bootstrap,
 * connected accounts, link-another-account, logout). Replaced by the real
 * three-column shell in Phase 3.
 */
export default function InboxPage() {
  const { data: user, isPending } = useSession();
  const logout = useLogout();

  if (isPending || user === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0]">
            <Mail className="size-5 text-white" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Welcome, {user.name.split(" ")[0]}
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Connected accounts
        </h2>
        <ul className="mb-6 space-y-2">
          {user.accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: account.color ?? "#6E56CF" }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{account.email}</p>
                <p className="text-xs text-muted-foreground">
                  {account.provider === "GOOGLE" ? "Gmail" : "Outlook"} ·{" "}
                  {account.syncStatus.toLowerCase()}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <a
            href={linkAccountUrl("google")}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]"
          >
            <Plus className="size-4" aria-hidden />
            Add account
          </a>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Phase 3 replaces this with the full three-column inbox.
        </p>
      </motion.div>
    </main>
  );
}
