"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";
import { useUi } from "@/contexts/ui-context";
import { AiPanel } from "@/features/ai/components/ai-panel";
import { useCompose } from "@/features/compose/compose-context";
import { ComposeModal } from "@/features/compose/components/compose-modal";
import { CommandPalette } from "@/features/search/command-palette";
import { ShortcutsHelpModal } from "@/features/shortcuts/shortcuts-help-modal";
import { useShortcut } from "@/features/shortcuts/use-shortcut";
import { useMailEvents } from "@/hooks/use-mail-events";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Sidebar } from "./sidebar";

/**
 * The NovaMail frame: deep-navy chrome with the mail surface floating inside
 * as a rounded card, per the reference design.
 *
 * Columns   ≥1280px: sidebar · list · reading pane · AI panel
 *           768–1279px: icon-rail sidebar · list · reading pane (AI overlays)
 *           <768px: single column (list ↔ thread swap, handled by MailPage)
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { toggleAiPanel, setAiPanelOpen, setPaletteOpen, setHelpOpen } = useUi();
  const { openNew } = useCompose();
  const { resolvedTheme } = useTheme();
  const isTablet = useMediaQuery("(max-width: 1279px)");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isDesktop = useMediaQuery("(min-width: 1280px)");

  useMailEvents();

  // AI panel is a persistent column on desktop, an on-demand overlay below.
  useEffect(() => {
    setAiPanelOpen(isDesktop);
  }, [isDesktop, setAiPanelOpen]);

  useShortcut("mod+k", () => setPaletteOpen(true), {
    scope: "global",
    description: "Open command palette",
  });
  useShortcut("/", () => setPaletteOpen(true), {
    scope: "mail",
    description: "Search",
  });
  useShortcut("c", () => openNew(), {
    scope: "mail",
    description: "Compose",
  });
  useShortcut("mod+j", () => toggleAiPanel(), {
    scope: "global",
    description: "Toggle AI panel",
  });
  useShortcut("shift+?", () => setHelpOpen(true), {
    scope: "mail",
    description: "Keyboard shortcuts",
  });

  return (
    <div className="flex h-dvh bg-chrome">
      {!isMobile && <Sidebar collapsed={isTablet} />}
      <main className="min-w-0 flex-1 p-2 pl-0 max-md:p-0">
        <div className="flex h-full overflow-hidden rounded-xl border border-border bg-background max-md:rounded-none">
          {children}
        </div>
      </main>

      <AiPanel />
      <CommandPalette />
      <ComposeModal />
      <ShortcutsHelpModal />
      <Toaster
        position="bottom-center"
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        toastOptions={{
          style: { borderRadius: "0.75rem" },
        }}
      />
    </div>
  );
}
