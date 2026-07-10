import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  structuredFilterSchema,
  type NlSearchResultDto,
  type StructuredFilter,
} from "@novamail/shared";
import { RedisService } from "../../redis/redis.service";
import { OpenAiClient } from "../ai/openai.client";
import { PROMPT_VERSIONS, SYSTEM } from "../ai/prompts";
import { SearchService } from "./search.service";

const CACHE_TTL_SECONDS = 7 * 24 * 3600;

/**
 * Natural-language search: OpenAI compiles the query into a StructuredFilter,
 * which is lowered to the same operator syntax the instant search parses —
 * one execution path, and the compilation is transparent (chips) and cached.
 */
@Injectable()
export class NlCompilerService {
  constructor(
    private readonly openai: OpenAiClient,
    private readonly redis: RedisService,
    private readonly search: SearchService,
  ) {}

  async run(userId: string, query: string): Promise<NlSearchResultDto> {
    const filter = await this.compile(query);
    const operatorQuery = this.lower(filter);
    const { threads } = await this.search.search(userId, operatorQuery);
    return { filter, chips: this.chips(filter), threads };
  }

  private async compile(query: string): Promise<StructuredFilter> {
    const normalized = query.trim().toLowerCase();
    const cacheKey = `nl:compile:v${PROMPT_VERSIONS.NL_SEARCH}:${createHash("sha256").update(normalized).digest("hex")}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached !== null) {
      const parsed = structuredFilterSchema.safeParse(JSON.parse(cached));
      if (parsed.success) return parsed.data;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { json } = await this.openai.completeJson([
      { role: "system", content: SYSTEM.nlSearch.replace("{today}", today) },
      { role: "user", content: query },
    ]);
    const filter = structuredFilterSchema.parse(json);
    await this.redis.client.set(
      cacheKey,
      JSON.stringify(filter),
      "EX",
      CACHE_TTL_SECONDS,
    );
    return filter;
  }

  /** StructuredFilter → the operator syntax SearchService already parses. */
  private lower(filter: StructuredFilter): string {
    const parts: string[] = [...filter.keywords];
    for (const from of filter.from) parts.push(`from:"${from}"`);
    for (const to of filter.to) parts.push(`to:"${to}"`);
    if (filter.dateFrom !== null) parts.push(`after:${filter.dateFrom}`);
    if (filter.dateTo !== null) parts.push(`before:${filter.dateTo}`);
    if (filter.hasAttachment) parts.push("has:attachment");
    if (filter.folder !== null) parts.push(`in:${filter.folder}`);
    for (const label of filter.labels) parts.push(`label:"${label}"`);
    if (filter.isUnread) parts.push("is:unread");
    if (filter.isStarred) parts.push("is:starred");
    return parts.join(" ");
  }

  private chips(filter: StructuredFilter): string[] {
    const chips: string[] = [];
    if (filter.keywords.length > 0) chips.push(filter.keywords.join(" "));
    for (const from of filter.from) chips.push(`from: ${from}`);
    for (const to of filter.to) chips.push(`to: ${to}`);
    if (filter.dateFrom !== null || filter.dateTo !== null) {
      chips.push(
        `${filter.dateFrom ?? "…"} → ${filter.dateTo ?? "now"}`,
      );
    }
    if (filter.hasAttachment) chips.push("has attachment");
    if (filter.folder !== null) chips.push(`in: ${filter.folder}`);
    for (const label of filter.labels) chips.push(`label: ${label}`);
    if (filter.isUnread) chips.push("unread");
    if (filter.isStarred) chips.push("starred");
    return chips;
  }
}
