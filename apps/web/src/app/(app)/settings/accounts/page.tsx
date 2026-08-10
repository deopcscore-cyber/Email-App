"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api-client";
import { X } from "lucide-react";
import { useOverlayScope, useShortcut } from "@/features/shortcuts/use-shortcut";
import { popIn } from "@/lib/motion";
import { linkAccountUrl } from "@/features/auth/api";
import { GoogleLogo, MicrosoftLogo } from "@/features/auth/components/provider-logos";
import { useChangePassword, useRemoveAccount, useSession } from "@/features/auth/use-session";

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: "Connecting was cancelled. Try again whenever you're ready.",
  provider: "The provider returned an error. Please try again.",
  missing_params: "The connection response was incomplete. Please try again.",
  no_account_found: "No NovaMail account has that connected. Try the other provider, or create an account.",
};

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

/** Confirms in-app rather than via window.confirm(), which some browsers
 * (embedded webviews especially) silently block or auto-dismiss -- when
 * that happens the click just does nothing, with no error and no way to
 * tell why. This can't silently no-op the same way. */
function RemoveAccountButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const removeAccount = useRemoveAccount();
  const close = (): void => setOpen(false);
  useOverlayScope(open);
  useShortcut("escape", close, { scope: "overlay", enabled: open });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={removeAccount.isPending}
        aria-label={`Remove ${label}`}
        title="Remove account"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        <X className="size-4" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={close} aria-hidden />
            <motion.div
              role="dialog"
              aria-label={`Remove ${label}?`}
              variants={popIn}
              initial="hidden"
              animate="show"
              exit="exit"
              style={{ transformOrigin: "top right" }}
              className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-border bg-surface p-3 shadow-2xl"
            >
              <p className="text-[13px] font-medium">Remove {label}?</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Its mail stays intact on the provider — this only disconnects
                it from NovaMail.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    removeAccount.mutate(id, {
                      onError: () => toast.error("Couldn't remove that account. Try again."),
                    });
                  }}
                  className="rounded-lg bg-danger px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const changePassword = useChangePassword();

  const serverError = changePassword.error;
  const errorMessage =
    fieldError ??
    (serverError instanceof ApiClientError
      ? serverError.message
      : serverError !== null && serverError !== undefined
        ? "Something went wrong. Please try again."
        : null);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setFieldError(null);
    if (password.length < 8) {
      setFieldError("At least 8 characters");
      return;
    }
    if (password !== confirm) {
      setFieldError("Passwords don't match");
      return;
    }
    changePassword.mutate(
      { password },
      {
        onSuccess: () => {
          setPassword("");
          setConfirm("");
          toast.success("Password updated");
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2.5 sm:max-w-sm">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        autoComplete="new-password"
        className="w-full rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent/60"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm new password"
        autoComplete="new-password"
        className="w-full rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent/60"
      />
      {errorMessage !== null && (
        <p role="alert" className="text-[12px] text-danger">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={changePassword.isPending}
        className="self-start rounded-xl bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {changePassword.isPending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

export default function AccountsSettingsPage() {
  const { data: user } = useSession();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const recovered = searchParams.get("recovered") === "1";
  const errorMessage =
    error === null ? null : (ERROR_MESSAGES[error] ?? "Something went wrong connecting that account.");

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">
        Connected accounts
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Every account you connect shows up in your unified inbox. You can
        also filter to one account at a time from the sidebar.
      </p>

      {errorMessage !== null && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-2.5 text-[13px] text-danger"
        >
          {errorMessage}
        </p>
      )}

      {recovered && (
        <p className="mt-4 rounded-lg border border-accent/20 bg-accent-soft px-4 py-2.5 text-[13px] text-accent">
          You're back in. Set a new password below so you can sign in
          normally next time.
        </p>
      )}

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
            <RemoveAccountButton
              id={account.id}
              label={account.displayName ?? account.email}
            />
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

      <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        Password
      </h2>
      <ChangePasswordForm />
    </div>
  );
}
