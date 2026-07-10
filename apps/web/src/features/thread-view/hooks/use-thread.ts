"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchThread } from "@/features/mail-list/api/threads.api";
import {
  threadKeys,
  useTriageThread,
} from "@/features/mail-list/hooks/use-threads";

export function useThread(id: string | null) {
  return useQuery({
    queryKey: threadKeys.detail(id ?? "none"),
    queryFn: () => fetchThread(id as string),
    enabled: id !== null,
  });
}

/** Opening an unread thread marks it read (mirrors Gmail behavior). */
export function useMarkReadOnOpen(
  id: string | null,
  unreadCount: number | undefined,
): void {
  const triage = useTriageThread();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (id !== null && unreadCount !== undefined && unreadCount > 0) {
      triage.mutate(
        { id, patch: { isRead: true } },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey: threadKeys.detail(id),
            });
          },
        },
      );
    }
    // triage/queryClient are stable; fire only when the thread changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, unreadCount]);
}
