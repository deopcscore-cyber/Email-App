"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { API_PREFIX, type MailEvent } from "@novamail/shared";
import { threadKeys } from "@/features/mail-list/hooks/use-threads";

/**
 * Single SSE subscription for the app: server events invalidate the right
 * query keys so the UI updates live without polling. EventSource reconnects
 * automatically on drops.
 */
export function useMailEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource(`${API_PREFIX}/events`);

    const invalidateLists = (): void => {
      void queryClient.invalidateQueries({
        queryKey: [...threadKeys.all, "list"],
      });
      void queryClient.invalidateQueries({ queryKey: threadKeys.counts });
    };

    source.addEventListener("mail.updated", (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as Extract<
        MailEvent,
        { type: "mail.updated" }
      >;
      invalidateLists();
      for (const threadId of event.threadIds) {
        void queryClient.invalidateQueries({
          queryKey: threadKeys.detail(threadId),
        });
      }
    });

    source.addEventListener("sendStatus.changed", (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as Extract<
        MailEvent,
        { type: "sendStatus.changed" }
      >;
      if (event.status === "SENT") {
        toast.dismiss(`send-${event.messageId}`);
        toast.success("Sent");
        invalidateLists();
      } else if (event.status === "FAILED") {
        toast.dismiss(`send-${event.messageId}`);
        toast.error("Send failed — check Drafts to retry");
        invalidateLists();
      }
    });

    source.addEventListener("snooze.fired", (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as Extract<
        MailEvent,
        { type: "snooze.fired" }
      >;
      toast(`Back from snooze: ${event.subject}`);
      invalidateLists();
    });

    source.addEventListener("sync.progress", () => {
      invalidateLists();
    });

    return () => source.close();
  }, [queryClient]);
}
