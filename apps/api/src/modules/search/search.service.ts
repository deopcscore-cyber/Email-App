import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { SearchResultDto, ThreadListItemDto } from "@novamail/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { ThreadsService } from "../threads/threads.service";

const OPERATOR_RE = /(\w+):(?:"([^"]+)"|(\S+))/g;
const KNOWN_OPERATORS = new Set([
  "from", "to", "in", "is", "has", "label", "before", "after",
]);

export interface ParsedQuery {
  keywords: string;
  operators: { key: string; value: string }[];
}

/** Splits `invoice from:john has:attachment` into keywords + operators. */
export function parseQuery(raw: string): ParsedQuery {
  const operators: { key: string; value: string }[] = [];
  const keywords = raw
    .replace(OPERATOR_RE, (match, key: string, quoted?: string, bare?: string) => {
      const lower = key.toLowerCase();
      if (!KNOWN_OPERATORS.has(lower)) return match;
      operators.push({ key: lower, value: (quoted ?? bare ?? "").toLowerCase() });
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { keywords, operators };
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly threads: ThreadsService,
  ) {}

  async search(userId: string, rawQuery: string): Promise<SearchResultDto> {
    const parsed = parseQuery(rawQuery);
    if (parsed.keywords === "" && parsed.operators.length === 0) {
      return { threads: [], parsed };
    }

    const conditions: Prisma.Sql[] = [
      Prisma.sql`a."userId" = ${userId}`,
      Prisma.sql`m."sendStatus" NOT IN ('QUEUED')`,
    ];

    if (parsed.keywords !== "") {
      conditions.push(Prisma.sql`
        (
          setweight(to_tsvector('english', coalesce(m."subject", '')), 'A') ||
          setweight(to_tsvector('english', coalesce(m."bodyText", '')), 'B')
        ) @@ websearch_to_tsquery('english', ${parsed.keywords})
      `);
    }

    for (const { key, value } of parsed.operators) {
      switch (key) {
        case "from":
          conditions.push(Prisma.sql`
            (m."fromAddress"->>'email' ILIKE ${"%" + value + "%"}
             OR m."fromAddress"->>'name' ILIKE ${"%" + value + "%"})
          `);
          break;
        case "to":
          conditions.push(
            Prisma.sql`m."toAddresses"::text ILIKE ${"%" + value + "%"}`,
          );
          break;
        case "in":
          conditions.push(
            Prisma.sql`t."folder" = ${value.toUpperCase()}::"Folder"`,
          );
          break;
        case "is":
          if (value === "unread") conditions.push(Prisma.sql`t."unreadCount" > 0`);
          if (value === "read") conditions.push(Prisma.sql`t."unreadCount" = 0`);
          if (value === "starred") conditions.push(Prisma.sql`t."isStarred" = true`);
          if (value === "pinned") conditions.push(Prisma.sql`t."isPinned" = true`);
          break;
        case "has":
          if (value === "attachment") {
            conditions.push(Prisma.sql`t."hasAttachments" = true`);
          }
          break;
        case "label":
          conditions.push(Prisma.sql`EXISTS (
            SELECT 1 FROM "thread_labels" tl
            JOIN "labels" l ON l."id" = tl."labelId"
            WHERE tl."threadId" = t."id" AND l."name" ILIKE ${value}
          )`);
          break;
        case "before":
          conditions.push(Prisma.sql`m."receivedAt" < ${new Date(value)}`);
          break;
        case "after":
          conditions.push(Prisma.sql`m."receivedAt" > ${new Date(value)}`);
          break;
      }
    }

    const rows = await this.prisma.$queryRaw<{ threadId: string }[]>(Prisma.sql`
      SELECT m."threadId" as "threadId", MAX(m."receivedAt") as latest
      FROM "messages" m
      JOIN "threads" t ON t."id" = m."threadId"
      JOIN "email_accounts" a ON a."id" = m."accountId"
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY m."threadId"
      ORDER BY latest DESC
      LIMIT 25
    `);

    const items = await Promise.all(
      rows.map((r) => this.threads.get(userId, r.threadId).catch(() => null)),
    );
    const threads: ThreadListItemDto[] = items
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .map(({ messages: _messages, ...listItem }) => listItem);
    return { threads, parsed };
  }
}
