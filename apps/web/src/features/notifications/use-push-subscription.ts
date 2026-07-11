"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchPushPublicKey,
  subscribeToPush,
  unsubscribeFromPush,
} from "./api/push.api";

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushSupportState =
  | "unsupported"
  | "unconfigured"
  | "loading"
  | "denied"
  | "subscribed"
  | "unsubscribed";

/** Manages the browser's Push API subscription lifecycle: service worker
 * registration, permission, and syncing the subscription with the backend. */
export function usePushSubscription() {
  const [state, setState] = useState<PushSupportState>("loading");

  const refresh = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    const { publicKey } = await fetchPushPublicKey();
    if (publicKey === "") {
      setState("unconfigured");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const existing = await registration.pushManager.getSubscription();
    setState(existing !== null ? "subscribed" : "unsubscribed");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<void> => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState("denied");
      return;
    }
    const { publicKey } = await fetchPushPublicKey();
    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = subscription.toJSON();
    if (json.endpoint === undefined || json.keys === undefined) return;
    await subscribeToPush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh ?? "", auth: json.keys.auth ?? "" },
    });
    setState("subscribed");
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription !== null && subscription !== undefined) {
      await unsubscribeFromPush(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setState("unsubscribed");
  }, []);

  return { state, subscribe, unsubscribe };
}
