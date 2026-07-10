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
  composeOpen: boolean;
  toggleAiPanel: () => void;
  setAiPanelOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setComposeOpen: (open: boolean) => void;
}

const UiContext = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  // Closed initially; AppShell opens it on desktop widths after mount.
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const toggleAiPanel = useCallback(() => setAiPanelOpen((v) => !v), []);

  const value = useMemo<UiState>(
    () => ({
      aiPanelOpen,
      paletteOpen,
      helpOpen,
      composeOpen,
      toggleAiPanel,
      setAiPanelOpen,
      setPaletteOpen,
      setHelpOpen,
      setComposeOpen,
    }),
    [aiPanelOpen, paletteOpen, helpOpen, composeOpen, toggleAiPanel],
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
