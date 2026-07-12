"use client";

import { useEffect, useState } from "react";
import { avatarHue } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Real photo when we have one, a Gravatar lookup by email otherwise, and a
 * colored initials circle as the final fallback. Gmail/Graph messages never
 * include the sender's photo (that needs the separate People/Contacts API,
 * its own OAuth scope, and a call per contact -- out of scope here), so
 * Gravatar is what gets most senders an actual photo instead of always
 * falling back to initials. SHA-256 (Gravatar's newer hash option) needs
 * nothing beyond the browser's built-in Web Crypto API -- no MD5 package.
 */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const gravatarCache = new Map<string, string>();

function initialsFor(name: string | null | undefined, email: string): string {
  const source = name ?? email.split("@")[0] ?? email;
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

export function Avatar({
  email,
  name,
  photoUrl,
  size = 36,
  className,
}: {
  email: string;
  name?: string | null;
  /** A known-real photo (e.g. the signed-in user's own OAuth picture).
   * Takes priority over the Gravatar lookup when present. */
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [gravatarUrl, setGravatarUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (photoUrl !== undefined && photoUrl !== null) return;
    const normalized = email.trim().toLowerCase();
    const cached = gravatarCache.get(normalized);
    if (cached !== undefined) {
      setGravatarUrl(cached);
      return;
    }
    let cancelled = false;
    void sha256Hex(normalized).then((hash) => {
      if (cancelled) return;
      const url = `https://www.gravatar.com/avatar/${hash}?s=${size * 2}&d=404`;
      gravatarCache.set(normalized, url);
      setGravatarUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [email, photoUrl, size]);

  const src = photoUrl ?? gravatarUrl;
  const hue = avatarHue(email);

  if (src !== null && src !== undefined && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        background: `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${(hue + 40) % 360} 55% 45%))`,
      }}
    >
      {initialsFor(name, email)}
    </span>
  );
}
