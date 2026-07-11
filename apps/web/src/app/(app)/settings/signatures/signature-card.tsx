"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { EmailAccountDto, SignatureDto } from "@novamail/shared";
import { Editor } from "@/features/compose/components/editor";
import { useUpdateSignature } from "@/features/signatures/use-signatures";

export function SignatureCard({
  account,
  signature,
}: {
  account: EmailAccountDto;
  signature: SignatureDto;
}) {
  const [bodyHtml, setBodyHtml] = useState(signature.bodyHtml);
  const [isEnabled, setIsEnabled] = useState(signature.isEnabled);
  const [dirty, setDirty] = useState(false);
  const mutation = useUpdateSignature();

  const save = (): void => {
    mutation.mutate(
      { accountId: account.id, body: { bodyHtml, isEnabled } },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Signature saved");
        },
        onError: () => toast.error("Couldn't save the signature"),
      },
    );
  };

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span
            className="block truncate text-[13px] font-medium"
            title={account.email}
          >
            {account.displayName ?? account.email}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {account.email}
          </span>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => {
              setIsEnabled(e.target.checked);
              setDirty(true);
            }}
          />
          Insert on new messages
        </label>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background">
        <Editor
          initialHtml={signature.bodyHtml}
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
          disabled={!dirty || mutation.isPending}
          onClick={save}
          className="rounded-lg bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] px-3.5 py-1.5 text-[12px] font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-40"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
