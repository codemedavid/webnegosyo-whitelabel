/**
 * The Activity tab's filters and how each text's status reads. Pure.
 *
 * The API filters by ONE outbox status, so "Waiting" and "Sent" ask the server
 * for exactly that, and "Not sent" (skipped, failed, cancelled, expired) reads
 * the unfiltered feed and keeps those rows — a page can then hold fewer rows
 * than it asked for, and "Load more" carries on from the same cursor.
 */

import type { OutboxStatus } from "./api";

export type ActivityFilter = "all" | "waiting" | "sent" | "not_sent";

export const ACTIVITY_FILTERS: readonly { label: string; value: ActivityFilter }[] = [
  { label: "All", value: "all" },
  { label: "Waiting", value: "waiting" },
  { label: "Sent", value: "sent" },
  { label: "Not sent", value: "not_sent" },
];

const NOT_SENT: readonly OutboxStatus[] = ["skipped", "failed", "cancelled", "expired"];

/** The server-side status filter for this tab, if one status says it. */
export function serverStatusFor(filter: ActivityFilter): OutboxStatus | undefined {
  if (filter === "waiting") return "queued";
  if (filter === "sent") return "sent";
  return undefined;
}

export function keepsStatus(filter: ActivityFilter, status: OutboxStatus): boolean {
  if (filter === "not_sent") return NOT_SENT.includes(status);
  if (filter === "waiting") return status === "queued" || status === "claimed";
  if (filter === "sent") return status === "sent";
  return true;
}

/** A reason line belongs under texts that did not go out. */
export function showsReason(status: OutboxStatus): boolean {
  return NOT_SENT.includes(status);
}

export type StatusTone = "good" | "waiting" | "bad" | "muted";

export function statusTone(status: OutboxStatus): StatusTone {
  if (status === "sent") return "good";
  if (status === "queued" || status === "claimed") return "waiting";
  if (status === "failed") return "bad";
  return "muted";
}
