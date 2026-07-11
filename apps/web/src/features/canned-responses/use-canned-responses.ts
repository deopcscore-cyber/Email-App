"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCannedResponseDto,
  UpdateCannedResponseDto,
} from "@novamail/shared";
import {
  createCannedResponse,
  deleteCannedResponse,
  fetchCannedResponses,
  updateCannedResponse,
} from "./api/canned-responses.api";

export const cannedResponseKeys = {
  all: ["canned-responses"] as const,
};

export function useCannedResponses() {
  return useQuery({
    queryKey: cannedResponseKeys.all,
    queryFn: fetchCannedResponses,
  });
}

export function useCreateCannedResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCannedResponseDto) => createCannedResponse(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cannedResponseKeys.all });
    },
  });
}

export function useUpdateCannedResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateCannedResponseDto;
    }) => updateCannedResponse(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cannedResponseKeys.all });
    },
  });
}

export function useDeleteCannedResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCannedResponse(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cannedResponseKeys.all });
    },
  });
}
