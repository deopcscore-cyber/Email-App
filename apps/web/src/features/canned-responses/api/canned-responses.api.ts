import type {
  CannedResponseDto,
  CreateCannedResponseDto,
  UpdateCannedResponseDto,
} from "@novamail/shared";
import { api } from "@/lib/api-client";

export function fetchCannedResponses(): Promise<CannedResponseDto[]> {
  return api<CannedResponseDto[]>("/canned-responses");
}

export function createCannedResponse(
  body: CreateCannedResponseDto,
): Promise<CannedResponseDto> {
  return api<CannedResponseDto>("/canned-responses", {
    method: "POST",
    body,
  });
}

export function updateCannedResponse(
  id: string,
  body: UpdateCannedResponseDto,
): Promise<CannedResponseDto> {
  return api<CannedResponseDto>(`/canned-responses/${id}`, {
    method: "PATCH",
    body,
  });
}

export function deleteCannedResponse(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/canned-responses/${id}`, { method: "DELETE" });
}
