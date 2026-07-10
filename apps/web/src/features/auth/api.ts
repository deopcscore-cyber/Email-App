import type { SessionUserDto } from "@novamail/shared";
import { api } from "@/lib/api-client";

export function fetchSession(): Promise<SessionUserDto> {
  return api<SessionUserDto>("/auth/session");
}

export function logout(): Promise<void> {
  return api<void>("/auth/logout", { method: "POST" });
}

/** OAuth entry points are full-page navigations, not XHR. */
export function signInUrl(provider: "google" | "microsoft"): string {
  return `/api/v1/auth/${provider}`;
}

export function linkAccountUrl(provider: "google" | "microsoft"): string {
  return `/api/v1/auth/${provider}?intent=link`;
}
