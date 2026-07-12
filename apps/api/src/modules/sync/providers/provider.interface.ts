import type { Address } from "@novamail/shared";

/** Normalized message as ingested from any provider. */
export interface ProviderMessage {
  providerMessageId: string;
  providerThreadId: string;
  /** RFC822 Message-Id header, used to set In-Reply-To/References on replies. */
  internetMessageId: string | null;
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  isRead: boolean;
  isStarred: boolean;
  folder: "INBOX" | "SENT" | "DRAFTS" | "SPAM" | "TRASH" | "ARCHIVE";
  receivedAt: Date;
  attachments: {
    providerAttachmentId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    isInline: boolean;
    contentId: string | null;
  }[];
}

export interface ProviderPage {
  messages: ProviderMessage[];
  nextPageToken: string | null;
}

export interface DeltaResult {
  /** Messages new or changed since the cursor. */
  changed: ProviderMessage[];
  /** Provider message ids deleted since the cursor. */
  deletedIds: string[];
  newCursor: string;
  /** True when the cursor expired and a full resync is required. */
  cursorExpired: boolean;
}

export interface OutgoingMessage {
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  bodyHtml: string;
  /** RFC822 Message-Id being replied to, for threading headers. */
  inReplyTo?: string;
  providerThreadId?: string;
  attachments: { filename: string; mimeType: string; content: Buffer }[];
}

export interface TriageWriteback {
  isRead?: boolean;
  isStarred?: boolean;
  folder?: string;
}

/**
 * Uniform surface over Gmail and Microsoft Graph. Implementations receive a
 * fresh access token per call — token refresh is the TokenBroker's job.
 */
export interface MailProvider {
  /** Newest-first page of messages for initial backfill. */
  listMessages(accessToken: string, pageToken?: string): Promise<ProviderPage>;
  /** Changes since cursor (Gmail historyId / Graph deltaLink). */
  fetchDelta(accessToken: string, cursor: string): Promise<DeltaResult>;
  /** Cursor to start delta syncing from "now" (set after backfill). */
  currentCursor(accessToken: string): Promise<string>;
  /** Sends a message; returns provider message + thread ids. */
  send(
    accessToken: string,
    message: OutgoingMessage,
  ): Promise<{ providerMessageId: string; providerThreadId: string }>;
  /** Mirrors a local triage action onto the provider. */
  applyTriage(
    accessToken: string,
    providerMessageIds: string[],
    action: TriageWriteback,
  ): Promise<void>;
  /** Downloads one attachment's bytes. */
  fetchAttachment(
    accessToken: string,
    providerMessageId: string,
    providerAttachmentId: string,
  ): Promise<Buffer>;
}
