"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CannedResponseDto } from "@novamail/shared";
import { Editor } from "@/features/compose/components/editor";
import {
  useDeleteCannedResponse,
  useUpdateCannedResponse,
} from "@/features/canned-responses/use-canned-responses";

export function CannedResponseCard({
  response,
}: {
  response: CannedResponseDto;
}) {
  const [title, setTitle] = useState(response.title);
  const [bodyHtml, setBodyHtml] = useState(response.bodyHtml);
  const [dirty, setDirty] = useState(false);
  const update = useUpdateCannedResponse();
  const remove = useDeleteCannedResponse();

  const save = (): void => {
    if (title.trim() === "") {
      toast.error("Give it a title");
      return;
    }
    update.mutate(
      { id: response.id, body: { title: title.trim(), bodyHtml } },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Saved");
        },
        onError: () => toast.error("Couldn't save"),
      },
    );
  };

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          placeholder="Title"
          className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-accent/50"
        />
        <button
          type="button"
          aria-label={`Delete ${response.title}`}
          onClick={() => remove.mutate(response.id)}
          className="rounded-lg p-1.5 text-muted-foreground hover:text-danger"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
        <Editor
          initialHtml={response.bodyHtml}
          onChange={(html) => {
            setBodyHtml(html);
            setDirty(true);
          }}
          onSubmit={() => {}}
        />
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        {dirty && (
          <span className="text-[11px] text-muted-foreground">
            Unsaved changes
          </span>
        )}
        <button
          type="button"
          disabled={!dirty || update.isPending}
          onClick={save}
          className="rounded-lg bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] px-3.5 py-1.5 text-[12px] font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-40"
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
