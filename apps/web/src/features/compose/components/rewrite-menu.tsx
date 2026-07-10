"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { RewriteTone } from "@novamail/shared";
import { streamRewrite } from "@/features/ai/api/ai.api";
import { cn } from "@/lib/utils";

const TONES: { tone: RewriteTone; label: string }[] = [
  { tone: "professional", label: "Professional" },
  { tone: "friendly", label: "Friendly" },
  { tone: "concise", label: "Concise" },
  { tone: "assertive", label: "Assertive" },
];

interface RewriteMenuProps {
  draftId: string;
  currentBody: string;
  onRewritten: (html: string) => void;
}

/** Tone/instruction rewrite for the compose editor, streamed from OpenAI. */
export function RewriteMenu({
  draftId,
  currentBody,
  onRewritten,
}: RewriteMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState("");
  const resultRef = useRef("");

  const run = (body: { tone?: RewriteTone; instruction?: string }): void => {
    const previous = currentBody;
    resultRef.current = "";
    setBusy(true);
    setOpen(false);
    streamRewrite(draftId, body, {
      onDelta: (delta) => {
        resultRef.current += delta;
      },
      onDone: () => {
        setBusy(false);
        if (resultRef.current.trim() === "") {
          toast.error("The rewrite came back empty — draft unchanged");
          return;
        }
        onRewritten(resultRef.current);
        toast("Draft rewritten", {
          action: { label: "Undo", onClick: () => onRewritten(previous) },
        });
      },
      onError: (message) => {
        setBusy(false);
        toast.error(message);
      },
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-expanded={open}
        aria-label="Rewrite with AI"
        title="Rewrite with AI"
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent-soft",
          busy && "opacity-70",
        )}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        AI
      </button>

      {open && (
        <div className="absolute bottom-11 left-0 z-20 w-64 rounded-xl border border-border bg-surface p-2 shadow-2xl">
          <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Rewrite draft
          </p>
          <div className="flex flex-wrap gap-1.5 px-1 pb-2">
            {TONES.map(({ tone, label }) => (
              <button
                key={tone}
                type="button"
                onClick={() => run({ tone })}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] transition-colors hover:border-accent/50 hover:text-accent"
              >
                {label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (instruction.trim() !== "") {
                run({ instruction: instruction.trim() });
                setInstruction("");
              }
            }}
          >
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Or describe the change…"
              aria-label="Custom rewrite instruction"
              className="w-full rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-accent/50"
            />
          </form>
        </div>
      )}
    </div>
  );
}
