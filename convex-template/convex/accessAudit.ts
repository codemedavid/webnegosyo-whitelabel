/**
 * The arithmetic of the tokenless-write counter, kept free of Convex imports so
 * it can be unit-tested (see accessAudit.test.ts). `auth.ts` does the reading
 * and writing.
 *
 * A row counts the writes one function took on one UTC day. Function names come
 * from the template's own source and rows age out, so the table stays small:
 * about a dozen functions times `ACCESS_AUDIT_RETENTION_DAYS`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const ACCESS_AUDIT_RETENTION_DAYS = 30;
/** The most days a report can ask for; nothing older is kept. */
export const ACCESS_AUDIT_MAX_DAYS = ACCESS_AUDIT_RETENTION_DAYS;
export const ACCESS_AUDIT_DEFAULT_DAYS = 7;
/** Rows one report may read; far above what a full retention window can hold. */
export const ACCESS_AUDIT_MAX_ROWS = 1000;
/** Rows one new day's write may delete, so catching up can never grow a transaction. */
export const ACCESS_AUDIT_PRUNE_BATCH = 50;

export interface AccessAuditCounts {
  tokenless: number;
  withToken: number;
}

export function auditDayKey(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

/** Rows with a `day` before this one have aged out. */
export function auditRetentionCutoff(atMs: number): string {
  return auditDayKey(atMs - ACCESS_AUDIT_RETENTION_DAYS * DAY_MS);
}

export function bumpedAuditCounts(
  current: AccessAuditCounts | null,
  hasToken: boolean
): AccessAuditCounts {
  const counts = current ?? { tokenless: 0, withToken: 0 };
  return hasToken
    ? { tokenless: counts.tokenless, withToken: counts.withToken + 1 }
    : { tokenless: counts.tokenless + 1, withToken: counts.withToken };
}

/** The earliest `day` of a report covering `days` days, today included. */
export function firstAuditDayOf(atMs: number, days: number): string {
  const wanted = Number.isFinite(days) ? Math.floor(days) : 1;
  const bounded = Math.min(Math.max(wanted, 1), ACCESS_AUDIT_MAX_DAYS);
  return auditDayKey(atMs - (bounded - 1) * DAY_MS);
}
