"use client";

import { useSearchParams } from "next/navigation";
import type { MailView } from "@novamail/shared";
import { EmailList } from "@/features/mail-list/components/email-list";
import { ThreadView } from "@/features/thread-view/components/thread-view";
import { useMailSelection } from "@/features/mail-list/hooks/use-mail-selection";
import { cn } from "@/lib/utils";

export function MailPage({ view }: { view: MailView }) {
  const searchParams = useSearchParams();
  const labelId = searchParams.get("label") ?? undefined;
  const { selectedId } = useMailSelection();

  return (
    <div className="relative flex h-full w-full">
      {/* On mobile the list hides while a thread is open (ThreadView overlays). */}
      <div
        className={cn(
          "flex h-full max-md:w-full",
          selectedId !== null && "max-md:hidden",
        )}
      >
        <EmailList view={view} labelId={labelId} />
      </div>
      <ThreadView />
    </div>
  );
}
