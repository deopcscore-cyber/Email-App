"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/** App-shell UI state: which overlays are open, AI panel visibility. */
interface UiState {
  aiPanelOpen: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  toggleAiPanel: () => void;
  setAiPanelOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
}

const UiContext = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  // Closed initially; AppShell opens it on desktop widths after mount.
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const toggleAiPanel = useCallback(() => setAiPanelOpen((v) => !v), []);

  const value = useMemo<UiState>(
    () => ({
      aiPanelOpen,
      paletteOpen,
      helpOpen,
      toggleAiPanel,
      setAiPanelOpen,
      setPaletteOpen,
      setHelpOpen,
    }),
    [aiPanelOpen, paletteOpen, helpOpen, toggleAiPanel],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiState {
  const ctx = useContext(UiContext);
  if (ctx === null) {
    throw new Error("useUi must be used within UiProvider");
  }
  return ctx;
}
