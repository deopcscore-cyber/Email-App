"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Keyboard scopes form a stack: the base "mail" scope is active in the
 * three-column view; overlays (palette, compose, help) push themselves on
 * top and capture all non-global shortcuts while open. "global" bindings
 * (e.g. mod+k) fire regardless of the active scope.
 */
export type ShortcutScope = "mail" | "overlay" | "global";

export interface ShortcutBinding {
  /**
   * Key spec: "j", "shift+p", "mod+k" (mod = ⌘ on mac, ctrl elsewhere),
   * or a two-step sequence like "g i".
   */
  keys: string;
  handler: (e: KeyboardEvent) => void;
  scope: ShortcutScope;
  /** Human description; powers the "?" help modal. */
  description?: string;
}

interface KeyboardContextValue {
  register: (id: string, binding: ShortcutBinding) => () => void;
  pushScope: (scope: "overlay") => () => void;
  bindings: () => ReadonlyMap<string, ShortcutBinding>;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

const SEQUENCE_TIMEOUT_MS = 800;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

interface ParsedChord {
  key: string;
  mod: boolean;
  shift: boolean;
}

function parseChord(spec: string): ParsedChord {
  const parts = spec.toLowerCase().split("+");
  return {
    key: parts[parts.length - 1] ?? "",
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
  };
}

function chordMatches(chord: ParsedChord, e: KeyboardEvent): boolean {
  return (
    e.key.toLowerCase() === chord.key &&
    (e.metaKey || e.ctrlKey) === chord.mod &&
    e.shiftKey === chord.shift
  );
}

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const bindingsRef = useRef(new Map<string, ShortcutBinding>());
  const [overlayDepth, setOverlayDepth] = useState(0);
  const overlayDepthRef = useRef(0);
  overlayDepthRef.current = overlayDepth;
  const pendingKeyRef = useRef<{ key: string; at: number } | null>(null);

  const register = useCallback(
    (id: string, binding: ShortcutBinding): (() => void) => {
      bindingsRef.current.set(id, binding);
      return () => {
        bindingsRef.current.delete(id);
      };
    },
    [],
  );

  const pushScope = useCallback((): (() => void) => {
    setOverlayDepth((d) => d + 1);
    return () => setOverlayDepth((d) => Math.max(0, d - 1));
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const editable = isEditableTarget(e.target);
      const activeScope: ShortcutScope =
        overlayDepthRef.current > 0 ? "overlay" : "mail";

      for (const binding of bindingsRef.current.values()) {
        const applies =
          binding.scope === "global" || binding.scope === activeScope;
        if (!applies) continue;

        const steps = binding.keys.split(" ");
        const isSequence = steps.length === 2;
        const chord = parseChord(isSequence ? (steps[0] as string) : binding.keys);

        // Plain single-key shortcuts must not fire while typing.
        if (editable && !chord.mod && chord.key !== "escape") continue;

        if (isSequence) {
          const first = parseChord(steps[0] as string);
          const second = parseChord(steps[1] as string);
          const pending = pendingKeyRef.current;
          if (
            pending !== null &&
            pending.key === first.key &&
            Date.now() - pending.at < SEQUENCE_TIMEOUT_MS &&
            chordMatches(second, e)
          ) {
            pendingKeyRef.current = null;
            e.preventDefault();
            binding.handler(e);
            return;
          }
          continue;
        }

        if (chordMatches(chord, e)) {
          e.preventDefault();
          binding.handler(e);
          pendingKeyRef.current = null;
          return;
        }
      }

      // No chord fired: remember this key as a possible sequence prefix.
      if (!editable && !e.metaKey && !e.ctrlKey && e.key.length === 1) {
        pendingKeyRef.current = { key: e.key.toLowerCase(), at: Date.now() };
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<KeyboardContextValue>(
    () => ({
      register,
      pushScope,
      bindings: () => bindingsRef.current,
    }),
    [register, pushScope],
  );

  return (
    <KeyboardContext.Provider value={value}>
      {children}
    </KeyboardContext.Provider>
  );
}

export function useKeyboard(): KeyboardContextValue {
  const ctx = useContext(KeyboardContext);
  if (ctx === null) {
    throw new Error("useKeyboard must be used within KeyboardProvider");
  }
  return ctx;
}
