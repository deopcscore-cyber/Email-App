"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { SessionUserDto, UpdateSettingsDto } from "@novamail/shared";
import { fetchSession, logout, updateSettings } from "./api";

export const sessionQueryKey = ["auth", "session"] as const;

/** The signed-in user, or null while loading / when signed out. */
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateSettingsDto) => updateSettings(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData<SessionUserDto>(sessionQueryKey, (prev) =>
        prev === undefined ? prev : { ...prev, settings },
      );
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });
}
