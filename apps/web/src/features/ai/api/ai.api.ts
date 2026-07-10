import type {
  ActionItemsDto,
  BriefingDto,
  NlSearchResultDto,
  ReminderDto,
  ReplySuggestionsDto,
  SmartLabelsDto,
} from "@novamail/shared";
import { api } from "@/lib/api-client";
import { streamPost, type SseCallbacks } from "@/lib/sse";

// Streaming features — return an abort function.
export const streamSummary = (threadId: string, cb: SseCallbacks) =>
  streamPost(`/ai/threads/${threadId}/summary`, {}, cb);

export const streamAsk = (threadId: string, question: string, cb: SseCallbacks) =>
  streamPost(`/ai/threads/${threadId}/ask`, { question }, cb);

export const streamExplain = (threadId: string, cb: SseCallbacks) =>
  streamPost(`/ai/threads/${threadId}/explain`, {}, cb);

export const streamTranslate = (
  threadId: string,
  targetLang: string,
  cb: SseCallbacks,
) => streamPost(`/ai/threads/${threadId}/translate`, { targetLang }, cb);

export const streamRewrite = (
  draftId: string,
  body: { tone?: string; instruction?: string },
  cb: SseCallbacks,
) => streamPost(`/ai/drafts/${draftId}/rewrite`, body, cb);

// Structured features.
export const fetchActionItems = (threadId: string) =>
  api<ActionItemsDto>(`/ai/threads/${threadId}/action-items`, { method: "POST" });

export const fetchReplySuggestions = (threadId: string) =>
  api<ReplySuggestionsDto>(`/ai/threads/${threadId}/reply-suggestions`, {
    method: "POST",
  });

export const fetchSmartLabels = (threadId: string) =>
  api<SmartLabelsDto>(`/ai/threads/${threadId}/smart-labels`, { method: "POST" });

export const fetchBriefing = () => api<BriefingDto>("/ai/briefing");

export const fetchReminders = () => api<ReminderDto[]>("/ai/reminders");

export const dismissReminder = (id: string) =>
  api<{ ok: true }>(`/ai/reminders/${id}/dismiss`, { method: "POST" });

export const nlSearch = (query: string) =>
  api<NlSearchResultDto>("/search/nl", { method: "POST", body: { query } });
