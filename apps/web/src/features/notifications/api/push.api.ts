import type { PushSubscribeDto } from "@novamail/shared";
import { api } from "@/lib/api-client";

export function fetchPushPublicKey(): Promise<{ publicKey: string }> {
  return api<{ publicKey: string }>("/push/public-key");
}

export function subscribeToPush(body: PushSubscribeDto): Promise<{ ok: true }> {
  return api<{ ok: true }>("/push/subscribe", { method: "POST", body });
}

export function unsubscribeFromPush(endpoint: string): Promise<{ ok: true }> {
  return api<{ ok: true }>("/push/subscribe", {
    method: "DELETE",
    body: { endpoint },
  });
}
