"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { linkAccountUrl } from "@/features/auth/api";
import { GoogleLogo, MicrosoftLogo } from "@/features/auth/components/provider-logos";
import { useSession } from "@/features/auth/use-session";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Connecting…",
  BACKFILLING: "Syncing…",
  ACTIVE: "Connected",
  ERROR: "Needs attention",
  DISCONNECTED: "Disconnected",
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "text-muted-foreground",
  BACKFILLING: "text-accent",
  ACTIVE: "text-emerald-600 dark:text-emerald-400",
  ERROR: "text-danger",
  DISCONNECTED: "text-danger",
};

const connectButtonClass =
  "flex items-center justify-center gap-3 rounded-xl border border-border bg-surface-muted " +
  "px-5 py-3 text-sm font-medium transition-colors duration-150 hover:bg-surface";

export default function AccountsSettingsPage() {
  const { data: user } = useSession();

  return (
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto px-6 py-8">
      <Link
        href="/inbox"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to inbox
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">
        Connected accounts
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Every account you connect shows up in your unified inbox. You can
        also filter to one account at a time from the sidebar.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {user?.accounts.map((account) => (
          <li
            key={account.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3"
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
              style={{ backgroundColor: account.color ?? "#6E56CF" }}
              aria-hidden
            >
              {(account.displayName ?? account.email).charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {account.displayName ?? account.email}
              </span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {account.email}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
              {account.provider === "GOOGLE" ? "Google" : "Microsoft"}
            </span>
            <span
              className={`shrink-0 text-[11px] font-medium ${STATUS_TONE[account.syncStatus] ?? "text-muted-foreground"}`}
            >
              {STATUS_LABEL[account.syncStatus] ?? account.syncStatus}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        Connect another account
      </h2>
      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
        <a href={linkAccountUrl("google")} className={connectButtonClass}>
          <GoogleLogo />
          Connect Google
        </a>
        <a href={linkAccountUrl("microsoft")} className={connectButtonClass}>
          <MicrosoftLogo />
          Connect Microsoft
        </a>
      </div>
    </div>
  );
}
