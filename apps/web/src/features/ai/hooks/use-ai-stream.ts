"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SseCallbacks } from "@/lib/sse";

export type StreamStatus = "idle" | "streaming" | "done" | "error";

/**
 * Drives one streaming AI surface: accumulates deltas into `text`, tracks
 * status, aborts on unmount or when a new run starts.
 */
export function useAiStream() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => () => abortRef.current?.(), []);

  const run = useCallback(
    (start: (callbacks: SseCallbacks) => () => void): void => {
      abortRef.current?.();
      setText("");
      setError(null);
      setStatus("streaming");
      abortRef.current = start({
        onDelta: (delta) => setText((prev) => prev + delta),
        onDone: () => setStatus("done"),
        onError: (message) => {
          setError(message);
          setStatus("error");
        },
      });
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.();
    setText("");
    setError(null);
    setStatus("idle");
  }, []);

  return { text, status, error, run, reset };
}
