"use client";

import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { useSession, useUpdateSettings } from "@/features/auth/use-session";
import { usePushSubscription } from "@/features/notifications/use-push-subscription";

const PUSH_STATE_COPY: Record<
  ReturnType<typeof usePushSubscription>["state"],
  string
> = {
  unsupported: "Your browser doesn't support push notifications.",
  unconfigured: "Push notifications aren't set up on this server yet.",
  loading: "Checking…",
  denied: "Blocked — enable notifications for this site in your browser settings.",
  subscribed: "Enabled on this device.",
  unsubscribed: "Off on this device.",
};

export default function NotificationsSettingsPage() {
  const { data: user } = useSession();
  const updateSettings = useUpdateSettings();
  const push = usePushSubscription();

  const soundEnabled = user?.settings.notificationSound ?? true;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Control how NovaMail lets you know when new mail arrives.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              {soundEnabled ? (
                <Volume2 className="size-4" aria-hidden />
              ) : (
                <VolumeX className="size-4" aria-hidden />
              )}
            </span>
            <span>
              <span className="block text-[13px] font-medium">
                Notification sound
              </span>
              <span className="block text-[12px] text-muted-foreground">
                Play a chime when new mail arrives while the app is open.
              </span>
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            aria-label="Toggle notification sound"
            onClick={() =>
              updateSettings.mutate({ notificationSound: !soundEnabled })
            }
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
              soundEnabled ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                soundEnabled ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              {push.state === "subscribed" ? (
                <Bell className="size-4" aria-hidden />
              ) : (
                <BellOff className="size-4" aria-hidden />
              )}
            </span>
            <span>
              <span className="block text-[13px] font-medium">
                Push notifications
              </span>
              <span className="block text-[12px] text-muted-foreground">
                {PUSH_STATE_COPY[push.state]}
              </span>
            </span>
          </div>
          {(push.state === "subscribed" || push.state === "unsubscribed") && (
            <button
              type="button"
              onClick={() =>
                void (push.state === "subscribed"
                  ? push.unsubscribe()
                  : push.subscribe())
              }
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-surface"
            >
              {push.state === "subscribed" ? "Disable" : "Enable"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
