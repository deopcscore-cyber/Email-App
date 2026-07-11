import type { SignatureDto, UpdateSignatureDto } from "@novamail/shared";
import { api } from "@/lib/api-client";

export function fetchSignatures(): Promise<SignatureDto[]> {
  return api<SignatureDto[]>("/signatures");
}

export function updateSignature(
  accountId: string,
  body: UpdateSignatureDto,
): Promise<SignatureDto> {
  return api<SignatureDto>(`/signatures/${accountId}`, {
    method: "PUT",
    body,
  });
}
