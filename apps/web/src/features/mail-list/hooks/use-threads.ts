"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  ListTab,
  MailView,
  ThreadPageDto,
  TriagePatchDto,
} from "@novamail/shared";
import { fetchCounts, fetchThreads, patchThread } from "../api/threads.api";

export const threadKeys = {
  all: ["threads"] as const,
  list: (view: MailView, tab?: ListTab, labelId?: string) =>
    ["threads", "list", view, tab ?? null, labelId ?? null] as const,
  detail: (id: string) => ["threads", "detail", id] as const,
  counts: ["threads", "counts"] as const,
};

export function useThreads(view: MailView, tab?: ListTab, labelId?: string) {
  return useInfiniteQuery({
    queryKey: threadKeys.list(view, tab, labelId),
    queryFn: ({ pageParam }) =>
      fetchThreads({ view, tab, labelId, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useThreadCounts() {
  return useQuery({
    queryKey: threadKeys.counts,
    queryFn: fetchCounts,
    staleTime: 15_000,
  });
}

/**
 * Optimistic triage mutation: the patch is mirrored into every cached thread
 * list immediately and rolled back on failure.
 */
export function useTriageThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TriagePatchDto }) =>
      patchThread(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: threadKeys.all });
      const previous = queryClient.getQueriesData<{
        pages: ThreadPageDto[];
        pageParams: unknown[];
      }>({ queryKey: [...threadKeys.all, "list"] });

      queryClient.setQueriesData<{
        pages: ThreadPageDto[];
        pageParams: unknown[];
      }>({ queryKey: [...threadKeys.all, "list"] }, (data) => {
        if (data === undefined) return data;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((t) =>
              t.id === id
                ? {
                    ...t,
                    ...(patch.isRead !== undefined && {
                      unreadCount: patch.isRead ? 0 : 1,
                    }),
                    ...(patch.isStarred !== undefined && {
                      isStarred: patch.isStarred,
                    }),
                    ...(patch.isPinned !== undefined && {
                      isPinned: patch.isPinned,
                    }),
                    ...(patch.folder !== undefined && { folder: patch.folder }),
                  }
                : t,
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: threadKeys.counts });
      void queryClient.invalidateQueries({
        queryKey: [...threadKeys.all, "list"],
      });
    },
  });
}
