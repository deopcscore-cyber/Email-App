"use client";

import { useRouter } from "next/navigation";
import { UiProvider } from "@/contexts/ui-context";
import { ComposeProvider } from "@/features/compose/compose-context";
import { KeyboardProvider } from "@/features/shortcuts/keyboard-provider";
import { useShortcut } from "@/features/shortcuts/use-shortcut";
import { AppShell } from "@/components/layout/app-shell";

/** g-prefixed folder jumps, registered once at the shell level. */
function GoShortcuts() {
  const router = useRouter();
  useShortcut("g i", () => router.push("/inbox"), {
    description: "Go to Inbox",
  });
  useShortcut("g s", () => router.push("/sent"), { description: "Go to Sent" });
  useShortcut("g d", () => router.push("/drafts"), {
    description: "Go to Drafts",
  });
  useShortcut("g t", () => router.push("/starred"), {
    description: "Go to Starred",
  });
  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>
      <ComposeProvider>
        <KeyboardProvider>
          <GoShortcuts />
          <AppShell>{children}</AppShell>
        </KeyboardProvider>
      </ComposeProvider>
    </UiProvider>
  );
}
