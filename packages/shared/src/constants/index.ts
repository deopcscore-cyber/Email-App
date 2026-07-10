/** Session cookie carrying the opaque session token (httpOnly). */
export const SESSION_COOKIE = "novamail_session";

/** CSRF cookie readable by JS; its value must be echoed in this header. */
export const CSRF_COOKIE = "novamail_csrf";
export const CSRF_HEADER = "x-csrf-token";

export const SESSION_TTL_DAYS = 30;

export const API_PREFIX = "/api/v1";

/** System folders (mirrors the Prisma `Folder` enum). */
export const FOLDERS = [
  "INBOX",
  "SENT",
  "DRAFTS",
  "SPAM",
  "TRASH",
  "ARCHIVE",
] as const;
export type FolderName = (typeof FOLDERS)[number];
