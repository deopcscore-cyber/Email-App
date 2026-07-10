"use client";

import { useQuery } from "@tanstack/react-query";
import type { LabelWithCountDto } from "@novamail/shared";
import { api } from "@/lib/api-client";

export function useLabels() {
  return useQuery({
    queryKey: ["labels"],
    queryFn: () => api<LabelWithCountDto[]>("/labels"),
    staleTime: 60_000,
  });
}
