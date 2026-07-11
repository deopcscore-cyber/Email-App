"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type {
  LoginDto,
  RegisterDto,
  SessionUserDto,
  UpdateSettingsDto,
} from "@novamail/shared";
import { fetchSession, login, logout, register, updateSettings } from "./api";

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

export function useRegister() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (dto: RegisterDto) => register(dto),
    onSuccess: (user) => {
      queryClient.setQueryData<SessionUserDto>(sessionQueryKey, user);
      router.replace("/settings/accounts");
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (dto: LoginDto) => login(dto),
    onSuccess: (user) => {
      queryClient.setQueryData<SessionUserDto>(sessionQueryKey, user);
      router.replace("/inbox");
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
