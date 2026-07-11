/** Queue names and typed job payloads — single source of truth for BullMQ. */

export const QUEUE_NAMES = {
  sync: "sync",
  send: "send",
  snooze: "snooze",
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface SyncJobData {
  kind: "backfill" | "delta" | "writeback" | "poll-all";
  /** Every kind but poll-all (a fan-out trigger) targets one account. */
  accountId?: string;
  /** writeback only */
  threadId?: string;
  action?: {
    isRead?: boolean;
    isStarred?: boolean;
    folder?: string;
    snoozedUntil?: string | null;
  };
}

export interface SendJobData {
  kind: "dispatch";
  messageId: string;
  userId: string;
}

export interface SnoozeJobData {
  kind: "wake";
  threadId: string;
  userId: string;
}

export type JobDataFor<Q extends QueueName> = Q extends "sync"
  ? SyncJobData
  : Q extends "send"
    ? SendJobData
    : SnoozeJobData;
