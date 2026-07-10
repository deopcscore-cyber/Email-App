"use client";

import { useEffect, useId, useRef } from "react";
import { useKeyboard, type ShortcutScope } from "./keyboard-provider";

/**
 * Declaratively bind a keyboard shortcut. The handler ref is kept fresh so
 * callers don't need to memoize.
 *
 *   useShortcut("j", () => focusNext(), { scope: "mail", description: "Next email" });
 */
export function useShortcut(
  keys: string,
  handler: (e: KeyboardEvent) => void,
  options: {
    scope?: ShortcutScope;
    enabled?: boolean;
    description?: string;
  } = {},
): void {
  const { register } = useKeyboard();
  const id = useId();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const { scope = "mail", enabled = true, description } = options;

  useEffect(() => {
    if (!enabled) return;
    return register(`${id}:${keys}`, {
      keys,
      scope,
      description,
      handler: (e) => handlerRef.current(e),
    });
  }, [register, id, keys, scope, enabled, description]);
}

/** Push the overlay scope while a modal/palette is open. */
export function useOverlayScope(open: boolean): void {
  const { pushScope } = useKeyboard();
  useEffect(() => {
    if (!open) return;
    return pushScope("overlay");
  }, [open, pushScope]);
}
