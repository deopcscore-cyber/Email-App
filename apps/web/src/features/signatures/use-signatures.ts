"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateSignatureDto } from "@novamail/shared";
import { fetchSignatures, updateSignature } from "./api/signatures.api";

export const signatureKeys = {
  all: ["signatures"] as const,
};

export function useSignatures() {
  return useQuery({
    queryKey: signatureKeys.all,
    queryFn: fetchSignatures,
  });
}

export function useUpdateSignature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      body,
    }: {
      accountId: string;
      body: UpdateSignatureDto;
    }) => updateSignature(accountId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: signatureKeys.all });
    },
  });
}
