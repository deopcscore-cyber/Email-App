"use client";

import { cn } from "@/lib/utils";
import type { StreamStatus } from "../hooks/use-ai-stream";

/**
 * Renders streamed AI text with a pulsing cursor while tokens arrive.
 * Supports the subset of markdown our prompts produce ('- ' bullets).
 */
export function StreamingText({
  text,
  status,
}: {
  text: string;
  status: StreamStatus;
}) {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  return (
    <div aria-live="polite" className="text-[13px] leading-6 text-foreground/90">
      {lines.map((line, i) => {
        const bullet = line.trimStart().startsWith("- ");
        return (
          <p key={i} className={cn("my-1 flex gap-2", bullet && "pl-1")}>
            {bullet && (
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
            )}
            <span>{bullet ? line.trimStart().slice(2) : line}</span>
          </p>
        );
      })}
      {status === "streaming" && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-accent align-text-bottom"
        />
      )}
    </div>
  );
}
