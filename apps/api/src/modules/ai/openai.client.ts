import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ENV, type Env } from "../../config/env";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
}

interface StreamChunk {
  choices?: { delta?: { content?: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
}

interface CompletionResponse {
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Minimal OpenAI Chat Completions client over fetch — streaming and JSON
 * modes, no SDK dependency. Real API calls only; the base URL is
 * configurable so tests can run against an OpenAI-compatible mock.
 */
@Injectable()
export class OpenAiClient {
  constructor(@Inject(ENV) private readonly env: Env) {}

  get isConfigured(): boolean {
    return this.env.OPENAI_API_KEY !== "";
  }

  private assertConfigured(): void {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        "AI is not configured on this server (missing OPENAI_API_KEY)",
      );
    }
  }

  /**
   * Streams completion text. Calls onDelta per token chunk; resolves with the
   * full text + usage when the stream ends.
   */
  async stream(
    messages: ChatMessage[],
    onDelta: (text: string) => void,
    options: { maxTokens?: number; temperature?: number } = {},
  ): Promise<{ text: string; usage: ChatUsage }> {
    this.assertConfigured();
    const res = await fetch(`${this.env.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.env.OPENAI_MODEL,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: options.maxTokens ?? 1_024,
        temperature: options.temperature ?? 0.4,
      }),
    });
    if (!res.ok || res.body === null) {
      throw new ServiceUnavailableException(
        `OpenAI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
      );
    }

    let text = "";
    const usage: ChatUsage = { promptTokens: 0, completionTokens: 0 };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // OpenAI streams SSE frames separated by double newlines.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("");
        if (data === "" || data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data) as StreamChunk;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta !== undefined && delta !== "") {
            text += delta;
            onDelta(delta);
          }
          if (chunk.usage != null) {
            usage.promptTokens = chunk.usage.prompt_tokens;
            usage.completionTokens = chunk.usage.completion_tokens;
          }
        } catch {
          // Ignore malformed keep-alive frames.
        }
      }
    }
    return { text, usage };
  }

  /** Non-streaming completion in JSON mode, for structured features. */
  async completeJson(
    messages: ChatMessage[],
    options: { maxTokens?: number } = {},
  ): Promise<{ json: unknown; usage: ChatUsage }> {
    this.assertConfigured();
    const res = await fetch(`${this.env.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.env.OPENAI_MODEL,
        messages,
        response_format: { type: "json_object" },
        max_tokens: options.maxTokens ?? 1_024,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(
        `OpenAI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
      );
    }
    const body = (await res.json()) as CompletionResponse;
    const content = body.choices[0]?.message.content ?? "{}";
    return {
      json: JSON.parse(content) as unknown,
      usage: {
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
      },
    };
  }
}
