import type {
  ListTab,
  MailView,
  ThreadCountsDto,
  ThreadDetailDto,
  ThreadListItemDto,
  ThreadPageDto,
  TriagePatchDto,
} from "@novamail/shared";
import { api } from "@/lib/api-client";

export function fetchThreads(params: {
  view: MailView;
  tab?: ListTab;
  cursor?: string;
  labelId?: string;
  accountId?: string;
}): Promise<ThreadPageDto> {
  const qs = new URLSearchParams({ view: params.view });
  if (params.tab !== undefined) qs.set("tab", params.tab);
  if (params.cursor !== undefined) qs.set("cursor", params.cursor);
  if (params.labelId !== undefined) qs.set("labelId", params.labelId);
  if (params.accountId !== undefined) qs.set("accountId", params.accountId);
  return api<ThreadPageDto>(`/threads?${qs.toString()}`);
}

export function fetchThread(id: string): Promise<ThreadDetailDto> {
  return api<ThreadDetailDto>(`/threads/${id}`);
}

export function patchThread(
  id: string,
  patch: TriagePatchDto,
): Promise<ThreadListItemDto> {
  return api<ThreadListItemDto>(`/threads/${id}`, { method: "PATCH", body: patch });
}

export function fetchCounts(): Promise<ThreadCountsDto> {
  return api<ThreadCountsDto>("/threads/counts");
}
