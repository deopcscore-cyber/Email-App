import { API_PREFIX, CSRF_COOKIE, CSRF_HEADER } from "@novamail/shared";

export interface SseCallbacks {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * POSTs to a streaming AI endpoint and parses the SSE frames
 * (event: delta/done/error). EventSource can't POST, so this uses fetch +
 * ReadableStream. Returns an abort function.
 */
export function streamPost(
  path: string,
  body: unknown,
  callbacks: SseCallbacks,
): () => void {
  const controller = new AbortController();
  const csrf =
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${CSRF_COOKIE}=`))
      ?.split("=")[1] ?? "";

  void (async () => {
    try {
      const res = await fetch(`${API_PREFIX}${path}`, {
        method: "POST",
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER]: csrf,
        },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok || res.body === null) {
        let message = `Request failed (${res.status})`;
        try {
          const payload = (await res.json()) as {
            error?: { message?: string };
          };
          message = payload.error?.message ?? message;
        } catch {
          // keep default
        }
        callbacks.onError(message);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          let event = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (event === "delta") {
            callbacks.onDelta((JSON.parse(data) as { text: string }).text);
          } else if (event === "done") {
            callbacks.onDone();
            return;
          } else if (event === "error") {
            callbacks.onError(
              (JSON.parse(data) as { message: string }).message,
            );
            return;
          }
        }
      }
      callbacks.onDone();
    } catch (err) {
      if (!controller.signal.aborted) {
        callbacks.onError(err instanceof Error ? err.message : "Stream failed");
      }
    }
  })();

  return () => controller.abort();
}
