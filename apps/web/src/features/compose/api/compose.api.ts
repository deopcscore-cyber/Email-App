import type {
  ContactDto,
  CreateDraftDto,
  DraftDto,
  SendResultDto,
  UpdateDraftDto,
} from "@novamail/shared";
import { api } from "@/lib/api-client";
import { API_PREFIX, CSRF_COOKIE, CSRF_HEADER } from "@novamail/shared";

export function createDraft(dto: CreateDraftDto): Promise<DraftDto> {
  return api<DraftDto>("/messages/drafts", { method: "POST", body: dto });
}

export function updateDraft(id: string, dto: UpdateDraftDto): Promise<DraftDto> {
  return api<DraftDto>(`/messages/drafts/${id}`, { method: "PATCH", body: dto });
}

export function deleteDraft(id: string): Promise<void> {
  return api<void>(`/messages/drafts/${id}`, { method: "DELETE" });
}

export function sendDraft(
  id: string,
  scheduledAt?: string,
): Promise<SendResultDto> {
  return api<SendResultDto>(`/messages/${id}/send`, {
    method: "POST",
    body: scheduledAt !== undefined ? { scheduledAt } : {},
  });
}

export function undoSend(id: string): Promise<DraftDto> {
  return api<DraftDto>(`/messages/${id}/undo`, { method: "POST" });
}

export function searchContacts(q: string): Promise<ContactDto[]> {
  return api<ContactDto[]>(`/contacts?q=${encodeURIComponent(q)}`);
}

/** Multipart upload — bypasses the JSON api() wrapper. */
export async function uploadAttachment(
  draftId: string,
  file: File,
): Promise<DraftDto["attachments"][number]> {
  const csrf =
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${CSRF_COOKIE}=`))
      ?.split("=")[1] ?? "";
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_PREFIX}/messages/${draftId}/attachments`, {
    method: "POST",
    credentials: "same-origin",
    headers: { [CSRF_HEADER]: csrf },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
  return (await res.json()) as DraftDto["attachments"][number];
}

export function removeAttachment(
  draftId: string,
  attachmentId: string,
): Promise<void> {
  return api<void>(`/messages/${draftId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}
