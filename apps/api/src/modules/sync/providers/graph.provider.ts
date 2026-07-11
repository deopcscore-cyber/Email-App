import { Injectable, Logger } from "@nestjs/common";
import type { Address } from "@novamail/shared";
import { mapWithConcurrency } from "./concurrency";
import type {
  DeltaResult,
  MailProvider,
  OutgoingMessage,
  ProviderMessage,
  ProviderPage,
  TriageWriteback,
} from "./provider.interface";

const BASE = "https://graph.microsoft.com/v1.0/me";
const PAGE_SIZE = 100;
// Mirrors the Gmail provider's cap -- Graph throttles per-user concurrent
// requests too, and a full page firing at once risks the same 429s.
const FETCH_CONCURRENCY = 8;

interface GraphRecipient {
  emailAddress: { name?: string; address: string };
}

interface GraphMessage {
  id: string;
  conversationId: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: "html" | "text"; content: string };
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  isRead?: boolean;
  isDraft?: boolean;
  flag?: { flagStatus?: string };
  receivedDateTime?: string;
  parentFolderId?: string;
  hasAttachments?: boolean;
  "@removed"?: { reason: string };
}

interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
  contentBytes?: string;
}

class GraphApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Graph API ${status}: ${body.slice(0, 200)}`);
  }
}

function toAddress(r: GraphRecipient | undefined): Address {
  return {
    name: r?.emailAddress.name ?? null,
    email: (r?.emailAddress.address ?? "unknown@unknown").toLowerCase(),
  };
}

function toRecipients(addresses: Address[]): GraphRecipient[] {
  return addresses.map((a) => ({
    emailAddress: { ...(a.name != null && { name: a.name }), address: a.email },
  }));
}

@Injectable()
export class GraphProvider implements MailProvider {
  private readonly logger = new Logger(GraphProvider.name);
  /** well-known folder id → our folder enum, resolved once per token. */
  private folderCache = new Map<string, Record<string, ProviderMessage["folder"]>>();

  private async call<T>(
    accessToken: string,
    url: string,
    init: RequestInit = {},
    attempt = 0,
  ): Promise<T> {
    const res = await fetch(url.startsWith("http") ? url : `${BASE}${url}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body !== undefined && { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
    if (!res.ok) {
      // 429s (throttling) are worth a couple of quick in-process retries
      // rather than failing the whole sync job.
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        return this.call<T>(accessToken, url, init, attempt + 1);
      }
      throw new GraphApiError(res.status, await res.text());
    }
    if (res.status === 202 || res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async folderMap(
    accessToken: string,
  ): Promise<Record<string, ProviderMessage["folder"]>> {
    const cached = this.folderCache.get(accessToken.slice(0, 24));
    if (cached !== undefined) return cached;

    const wellKnown: [string, ProviderMessage["folder"]][] = [
      ["inbox", "INBOX"],
      ["sentitems", "SENT"],
      ["drafts", "DRAFTS"],
      ["junkemail", "SPAM"],
      ["deleteditems", "TRASH"],
      ["archive", "ARCHIVE"],
    ];
    const map: Record<string, ProviderMessage["folder"]> = {};
    await Promise.all(
      wellKnown.map(async ([name, folder]) => {
        try {
          const res = await this.call<{ id: string }>(
            accessToken,
            `/mailFolders/${name}`,
          );
          map[res.id] = folder;
        } catch {
          // Folder may not exist (e.g. archive) — ignore.
        }
      }),
    );
    this.folderCache.set(accessToken.slice(0, 24), map);
    return map;
  }

  private toProviderMessage(
    msg: GraphMessage,
    folders: Record<string, ProviderMessage["folder"]>,
  ): ProviderMessage {
    const folder =
      msg.isDraft === true
        ? "DRAFTS"
        : (folders[msg.parentFolderId ?? ""] ?? "ARCHIVE");
    return {
      providerMessageId: msg.id,
      providerThreadId: msg.conversationId,
      from: toAddress(msg.from),
      to: (msg.toRecipients ?? []).map(toAddress),
      cc: (msg.ccRecipients ?? []).map(toAddress),
      subject: msg.subject ?? "",
      snippet: msg.bodyPreview ?? "",
      bodyHtml: msg.body?.contentType === "html" ? msg.body.content : null,
      bodyText: msg.body?.contentType === "text" ? msg.body.content : null,
      isRead: msg.isRead ?? true,
      isStarred: msg.flag?.flagStatus === "flagged",
      folder,
      receivedAt: new Date(msg.receivedDateTime ?? Date.now()),
      attachments: [], // fetched lazily below when hasAttachments
    };
  }

  private async attachAttachments(
    accessToken: string,
    msg: GraphMessage,
    normalized: ProviderMessage,
  ): Promise<void> {
    if (msg.hasAttachments !== true) return;
    const res = await this.call<{ value: GraphAttachment[] }>(
      accessToken,
      `/messages/${msg.id}/attachments?$select=id,name,contentType,size,isInline,contentId`,
    );
    normalized.attachments = res.value.map((a) => ({
      providerAttachmentId: a.id,
      filename: a.name,
      mimeType: a.contentType,
      sizeBytes: a.size,
      isInline: a.isInline,
      contentId: a.contentId ?? null,
    }));
  }

  async listMessages(
    accessToken: string,
    pageToken?: string,
  ): Promise<ProviderPage> {
    const folders = await this.folderMap(accessToken);
    const url =
      pageToken ??
      `/messages?$top=${PAGE_SIZE}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,isRead,isDraft,flag,receivedDateTime,parentFolderId,hasAttachments`;
    const res = await this.call<{
      value: GraphMessage[];
      "@odata.nextLink"?: string;
    }>(accessToken, url);

    const messages = await mapWithConcurrency(res.value, FETCH_CONCURRENCY, async (m) => {
      const normalized = this.toProviderMessage(m, folders);
      await this.attachAttachments(accessToken, m, normalized);
      return normalized;
    });
    return { messages, nextPageToken: res["@odata.nextLink"] ?? null };
  }

  async currentCursor(accessToken: string): Promise<string> {
    // Drain the delta stream once to obtain a deltaLink representing "now".
    let url = `/messages/delta?$top=${PAGE_SIZE}&$select=id`;
    for (;;) {
      const res = await this.call<{
        value: GraphMessage[];
        "@odata.nextLink"?: string;
        "@odata.deltaLink"?: string;
      }>(accessToken, url);
      if (res["@odata.deltaLink"] !== undefined) return res["@odata.deltaLink"];
      if (res["@odata.nextLink"] === undefined) {
        throw new Error("Graph delta stream ended without a deltaLink");
      }
      url = res["@odata.nextLink"];
    }
  }

  async fetchDelta(accessToken: string, cursor: string): Promise<DeltaResult> {
    const folders = await this.folderMap(accessToken);
    const changed: ProviderMessage[] = [];
    const deletedIds: string[] = [];
    let url = cursor;

    try {
      for (;;) {
        const res = await this.call<{
          value: GraphMessage[];
          "@odata.nextLink"?: string;
          "@odata.deltaLink"?: string;
        }>(accessToken, url);
        for (const m of res.value) {
          if (m["@removed"] !== undefined) {
            deletedIds.push(m.id);
          } else {
            // Delta payloads are sparse; fetch the full message.
            const full = await this.call<GraphMessage>(
              accessToken,
              `/messages/${m.id}?$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,isRead,isDraft,flag,receivedDateTime,parentFolderId,hasAttachments`,
            );
            const normalized = this.toProviderMessage(full, folders);
            await this.attachAttachments(accessToken, full, normalized);
            changed.push(normalized);
          }
        }
        if (res["@odata.deltaLink"] !== undefined) {
          return {
            changed,
            deletedIds,
            newCursor: res["@odata.deltaLink"],
            cursorExpired: false,
          };
        }
        url = res["@odata.nextLink"] as string;
      }
    } catch (err) {
      // 410 Gone = delta token expired; caller performs a full resync.
      if (err instanceof GraphApiError && err.status === 410) {
        return { changed: [], deletedIds: [], newCursor: cursor, cursorExpired: true };
      }
      throw err;
    }
  }

  async send(
    accessToken: string,
    message: OutgoingMessage,
  ): Promise<{ providerMessageId: string; providerThreadId: string }> {
    // Create as draft first so we get ids back (sendMail returns 202 only).
    const draft = await this.call<GraphMessage>(accessToken, "/messages", {
      method: "POST",
      body: JSON.stringify({
        subject: message.subject,
        body: { contentType: "html", content: message.bodyHtml },
        toRecipients: toRecipients(message.to),
        ccRecipients: toRecipients(message.cc),
        bccRecipients: toRecipients(message.bcc),
      }),
    });
    for (const att of message.attachments) {
      await this.call(accessToken, `/messages/${draft.id}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: att.filename,
          contentType: att.mimeType,
          contentBytes: att.content.toString("base64"),
        }),
      });
    }
    await this.call(accessToken, `/messages/${draft.id}/send`, {
      method: "POST",
    });
    return {
      providerMessageId: draft.id,
      providerThreadId: draft.conversationId,
    };
  }

  async applyTriage(
    accessToken: string,
    providerMessageIds: string[],
    action: TriageWriteback,
  ): Promise<void> {
    for (const id of providerMessageIds) {
      if (action.isRead !== undefined) {
        await this.call(accessToken, `/messages/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ isRead: action.isRead }),
        });
      }
      if (action.isStarred !== undefined) {
        await this.call(accessToken, `/messages/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            flag: { flagStatus: action.isStarred ? "flagged" : "notFlagged" },
          }),
        });
      }
      if (action.folder !== undefined) {
        const destination: Record<string, string> = {
          ARCHIVE: "archive",
          INBOX: "inbox",
          SPAM: "junkemail",
          TRASH: "deleteditems",
        };
        const dest = destination[action.folder];
        if (dest !== undefined) {
          await this.call(accessToken, `/messages/${id}/move`, {
            method: "POST",
            body: JSON.stringify({ destinationId: dest }),
          });
        }
      }
    }
  }

  async fetchAttachment(
    accessToken: string,
    providerMessageId: string,
    providerAttachmentId: string,
  ): Promise<Buffer> {
    const res = await this.call<GraphAttachment>(
      accessToken,
      `/messages/${providerMessageId}/attachments/${providerAttachmentId}`,
    );
    return Buffer.from(res.contentBytes ?? "", "base64");
  }
}
