"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertOctagon,
  Clock,
  FileText,
  Inbox,
  Mail,
  PenLine,
  Send,
  Star,
  Tag,
  Trash2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MailView } from "@novamail/shared";
import { useSession } from "@/features/auth/use-session";
import { useCompose } from "@/features/compose/compose-context";
import { useLabels } from "@/features/labels/use-labels";
import {
  useThreadCounts,
} from "@/features/mail-list/hooks/use-threads";
import { transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  view: MailView;
  label: string;
  icon: LucideIcon;
  countKey?: "inbox" | "drafts" | "snoozed" | "spam";
}

const NAV_ITEMS: NavItem[] = [
  { view: "inbox", label: "Inbox", icon: Inbox, countKey: "inbox" },
  { view: "priority", label: "Priority", icon: Zap },
  { view: "snoozed", label: "Snoozed", icon: Clock, countKey: "snoozed" },
  { view: "starred", label: "Starred", icon: Star },
  { view: "sent", label: "Sent", icon: Send },
  { view: "drafts", label: "Drafts", icon: FileText, countKey: "drafts" },
  { view: "spam", label: "Spam", icon: AlertOctagon, countKey: "spam" },
  { view: "trash", label: "Trash", icon: Trash2 },
];

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { data: user } = useSession();
  const { data: counts } = useThreadCounts();
  const { data: labels } = useLabels();
  const { openNew } = useCompose();

  return (
    <nav
      aria-label="Mailboxes"
      className={cn(
        "flex h-full flex-col gap-1 px-3 py-4 text-chrome-foreground",
        collapsed ? "w-16 items-center" : "w-60",
      )}
    >
      {/* Logo */}
      <Link
        href="/inbox"
        className="mb-3 flex items-center gap-2.5 px-2"
        aria-label="NovaMail home"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0]">
          <Mail className="size-4 text-white" aria-hidden />
        </span>
        {!collapsed && (
          <span className="text-[15px] font-semibold tracking-tight">
            NovaMail
          </span>
        )}
      </Link>

      {/* Compose */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => openNew()}
        className={cn(
          "mb-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] text-sm font-medium text-white",
          "shadow-[0_4px_16px_-4px_rgba(124,92,252,0.5)] transition-[filter] duration-200 hover:brightness-110",
          collapsed ? "size-10" : "h-10 w-full",
        )}
      >
        <PenLine className="size-4" aria-hidden />
        {!collapsed && "Compose"}
      </motion.button>

      {/* Folders */}
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ view, label, icon: Icon, countKey }) => {
          const active = pathname === `/${view}`;
          const count =
            countKey !== undefined ? (counts?.[countKey] ?? 0) : 0;
          return (
            <li key={view}>
              <Link
                href={`/${view}`}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors duration-150",
                  active
                    ? "font-medium text-white"
                    : "text-chrome-muted hover:bg-white/5 hover:text-white",
                  collapsed && "justify-center px-0 py-2",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    transition={transitions.spring}
                    className="absolute inset-0 rounded-lg bg-white/10"
                    aria-hidden
                  />
                )}
                <Icon className="relative z-10 size-4 shrink-0" aria-hidden />
                {!collapsed && (
                  <>
                    <span className="relative z-10 flex-1">{label}</span>
                    {count > 0 && (
                      <span
                        className={cn(
                          "relative z-10 rounded-md px-1.5 py-px text-[11px] tabular-nums",
                          view === "inbox"
                            ? "bg-[#7C5CFC] text-white"
                            : "text-chrome-muted",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Labels */}
      {!collapsed && (
        <>
          <div className="mt-5 mb-1 flex items-center justify-between px-2.5">
            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-chrome-muted">
              <Tag className="size-3" aria-hidden />
              Labels
            </span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {(labels ?? []).map((label) => (
              <li key={label.id}>
                <Link
                  href={`/inbox?label=${label.id}`}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-[13px] text-chrome-muted transition-colors duration-150 hover:bg-white/5 hover:text-white"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{label.name}</span>
                  {label.threadCount > 0 && (
                    <span className="text-[11px] tabular-nums text-chrome-muted/70">
                      {label.threadCount}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Footer: user + theme */}
      <div className="mt-auto flex items-center gap-2.5 border-t border-white/10 px-2 pt-3">
        {user !== undefined && (
          <>
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold"
              aria-hidden
            >
              {user.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {user.name}
                </span>
                <span className="block truncate text-[11px] text-chrome-muted">
                  {user.email}
                </span>
              </span>
            )}
          </>
        )}
        {!collapsed && <ThemeToggle />}
      </div>
    </nav>
  );
}
