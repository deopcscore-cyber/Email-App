"use client";

import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useCannedResponses,
  useCreateCannedResponse,
} from "@/features/canned-responses/use-canned-responses";
import { CannedResponseCard } from "./canned-response-card";

export default function CannedResponsesSettingsPage() {
  const { data: responses } = useCannedResponses();
  const create = useCreateCannedResponse();

  const addNew = (): void => {
    create.mutate(
      { title: "Untitled", bodyHtml: "" },
      { onError: () => toast.error("Couldn't create it") },
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Canned responses
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Reusable snippets you can insert into any draft from the
            compose toolbar.
          </p>
        </div>
        <button
          type="button"
          onClick={addNew}
          disabled={create.isPending}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] px-3 py-2 text-[12px] font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-40"
        >
          <Plus className="size-3.5" aria-hidden />
          New
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {responses?.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
            No canned responses yet — create one to reuse it in compose.
          </p>
        )}
        {responses?.map((response) => (
          <CannedResponseCard key={response.id} response={response} />
        ))}
      </div>
    </div>
  );
}
