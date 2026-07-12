import type {
  LoginDto,
  RegisterDto,
  SessionUserDto,
  UpdateSettingsDto,
  UserSettingsDto,
} from "@novamail/shared";
import { api } from "@/lib/api-client";

export function fetchSession(): Promise<SessionUserDto> {
  return api<SessionUserDto>("/auth/session");
}

export function register(body: RegisterDto): Promise<SessionUserDto> {
  return api<SessionUserDto>("/auth/register", { method: "POST", body });
}

export function login(body: LoginDto): Promise<SessionUserDto> {
  return api<SessionUserDto>("/auth/login", { method: "POST", body });
}

export function updateSettings(body: UpdateSettingsDto): Promise<UserSettingsDto> {
  return api<UserSettingsDto>("/me/settings", { method: "PATCH", body });
}

export function logout(): Promise<void> {
  return api<void>("/auth/logout", { method: "POST" });
}

export function removeAccount(accountId: string): Promise<void> {
  return api<void>(`/me/accounts/${accountId}`, { method: "DELETE" });
}

/** Mailbox connect entry points are full-page navigations, not XHR — they
 * require an existing NovaMail session and hand off to the provider. */
export function linkAccountUrl(provider: "google" | "microsoft"): string {
  return `/api/v1/auth/${provider}`;
}
