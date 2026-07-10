import { API_PREFIX, CSRF_COOKIE, CSRF_HEADER } from "@novamail/shared";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

/**
 * Typed fetch wrapper for the NovaMail API. Same-origin (the web app proxies
 * /api to the backend), sends the CSRF header on mutations, and normalizes
 * the error envelope into ApiClientError.
 */
export async function api<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const { body, headers, ...rest } = init;
  const method = rest.method ?? "GET";

  const res = await fetch(`${API_PREFIX}${path}`, {
    ...rest,
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" && method !== "HEAD"
        ? { [CSRF_HEADER]: readCookie(CSRF_COOKIE) ?? "" }
        : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    let code = "INTERNAL";
    let message = res.statusText;
    try {
      const payload = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      code = payload.error?.code ?? code;
      message = payload.error?.message ?? message;
    } catch {
      // non-JSON error body; keep defaults
    }
    throw new ApiClientError(res.status, code, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
