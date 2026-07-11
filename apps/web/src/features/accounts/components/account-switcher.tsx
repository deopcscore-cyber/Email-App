"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import type { EmailAccountDto } from "@novamail/shared";
import { cn } from "@/lib/utils";

const FALLBACK_COLOR = "#6E56CF";

function initial(account: EmailAccountDto): string {
  const source = account.displayName ?? account.email;
  return source.charAt(0).toUpperCase();
}

/** Compact chip row: pick a single connected mailbox or "All" for the
 * unified inbox. Selection lives in the URL (?account=) so it survives
 * navigation and is shareable/bookmarkable like the label filter. */
export function AccountSwitcher({
  accounts,
}: {
  accounts: EmailAccountDto[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("account");

  if (accounts.length < 2) return null;

  const setAccount = (id: string | null): void => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === null) params.delete("account");
    else params.set("account", id);
    const qs = params.toString();
    router.push(qs.length > 0 ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      role="tablist"
      aria-label="Filter by account"
      className="mb-3 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeId === null}
        onClick={() => setAccount(null)}
        title="All accounts"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors",
          activeId === null
            ? "border-white/30 bg-white/15 text-white"
            : "border-white/10 text-chrome-muted hover:bg-white/5",
        )}
      >
        All
      </button>
      {accounts.map((account) => (
        <button
          key={account.id}
          type="button"
          role="tab"
          aria-selected={activeId === account.id}
          onClick={() => setAccount(account.id)}
          title={account.email}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white transition-[outline] outline outline-2 outline-offset-1",
            activeId === account.id ? "outline-white/70" : "outline-transparent",
          )}
          style={{ backgroundColor: account.color ?? FALLBACK_COLOR }}
        >
          {initial(account)}
        </button>
      ))}
      <Link
        href="/settings/accounts"
        title="Manage accounts"
        aria-label="Manage accounts"
        className="ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-chrome-muted hover:bg-white/5 hover:text-white"
      >
        <Settings className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
