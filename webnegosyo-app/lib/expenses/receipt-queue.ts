/**
 * Receipt photos waiting to upload, modelled on `lib/gov-id-photos/photo-queue.ts`.
 *
 * A receipt can only be filed under a recorded expense (the route needs its
 * id), and an expense typed offline has no id until the expense queue lands
 * it. So an entry carries the expense's `client_request_id` and is resolved to
 * a server id on the way out; until then it simply waits.
 *
 * Waiting is free: a pass where the expense has not landed yet, or where the
 * phone got no answer at all (offline, timeout, no session), is not an
 * attempt. Only a real answer that says "not now" counts, and backs off like
 * the expense queue. A photo the server will never take, or one that used up
 * `MAX_RECEIPT_ATTEMPTS`, is never dropped silently: it stays on the phone
 * marked with why (`refusedReason`) until a person taps Try again or removes
 * it. The local copy is deleted once it is sent or removed (receipts show
 * supplier names and TINs; they must not pile up on a shared register).
 *
 * Like the expense queue, entries carry the person who took them and a flush
 * only uploads the signed-in person's; the storage lock is never held while a
 * photo is on the wire, so a save made during an upload returns at once.
 *
 * Storage, id resolution, upload and file deletion are injected so this runs
 * under the node Jest project; `live-expense-queue.ts` wires the real ones.
 */

import { belongsTo, nextExpenseRetryAt } from "./expense-queue";

export const EXPENSE_RECEIPT_STORAGE_KEY = "wn-expense-receipt-queue-v1";
export const EXPENSE_RECEIPT_ROUTE = "/api/expenses/receipts";
export const MAX_RECEIPT_ATTEMPTS = 60;
export const MAX_QUEUED_RECEIPTS = 40;
/**
 * The bucket takes 5 MB, but the route sits behind Vercel's 4.5 MB request cap
 * (multipart overhead included), so the phone keeps a photo well under 4 MB.
 */
export const MAX_RECEIPT_BYTES = Math.floor(3.5 * 1024 * 1024);

export type ReceiptMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export interface QueuedReceipt {
  /** One per expense + file. */
  id: string;
  tenantId: string;
  /** Who took it; absent on photos queued before this was recorded (= whoever is signed in). */
  userId?: string | null;
  /** The expense's request id — always known, even offline. */
  clientRequestId: string;
  /** The server id, once known. */
  expenseId: string | null;
  fileUri: string;
  mime: ReceiptMime;
  /** Uploads that got a real "not now" answer. Waiting offline is not counted. */
  attempts: number;
  queuedAt: number;
  /** Epoch ms before which it is not tried again; absent/null = due now. */
  retryAt?: number | null;
  /** Why it stopped trying; it then waits for a person (Try again / Remove). */
  refusedReason?: string | null;
}

export type NewQueuedReceipt = Omit<QueuedReceipt, "id" | "attempts" | "queuedAt" | "retryAt" | "refusedReason">;

/**
 * What one upload attempt means for the entry: `offline` = no answer at all
 * (not an attempt), `retry` = an answer that may change, `drop` = the server
 * will never take this file.
 */
export type UploadVerdict = "sent" | "retry" | "offline" | "drop";

/** A `drop` with the plain words to show beside the photo. */
export interface RefusedUpload {
  verdict: "drop";
  reason: string;
}

export type UploadAnswer = UploadVerdict | RefusedUpload;

const REFUSED_STATUSES: readonly number[] = [400, 403, 409, 413, 415, 422];
const DEFAULT_REFUSAL = "The photo could not be added to this expense.";
export const RECEIPT_GAVE_UP_REASON = "The photo did not upload after many tries.";

/**
 * An HTTP answer (null = no answer: offline, timeout, no session) as a verdict.
 * 404 is "the expense is not readable yet" or "the route is not shipped yet":
 * both resolve with time. 401 is usually a token mid-refresh. 409 is "that
 * expense was voided" (or already holds its 10 receipts): it never changes.
 */
export function verdictForStatus(status: number | null): UploadVerdict {
  if (status === null) return "offline";
  if (status >= 200 && status < 300) return "sent";
  if (REFUSED_STATUSES.includes(status)) return "drop";
  return "retry";
}

/** Why the server would not take a photo, in plain words (never the cashier's fault). */
export function receiptRefusalReason(status: number): string {
  switch (status) {
    case 413:
      return "The photo is too large to upload.";
    case 415:
      return "This kind of file cannot be added as a receipt.";
    case 409:
      return "This expense was undone, or already has all the photos it can hold.";
    case 403:
      return "This account cannot add photos to this expense.";
    default:
      return DEFAULT_REFUSAL;
  }
}

export interface ReceiptKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ReceiptQueueDeps {
  storage: ReceiptKeyValueStorage;
  /** The server id for a request id; null = not landed yet. */
  resolveExpenseId(entry: QueuedReceipt): Promise<string | null>;
  upload(entry: QueuedReceipt, expenseId: string): Promise<UploadAnswer>;
  deleteFile(fileUri: string): Promise<void>;
  now?: () => number;
}

export interface ReceiptQueue {
  enqueue(receipt: NewQueuedReceipt): Promise<void>;
  /**
   * Uploads what is due for this store (with `userId`, only that person's);
   * returns how many still wait to upload (marked ones not counted).
   */
  flush(tenantId: string, userId?: string | null): Promise<number>;
  /** Waiting AND marked photos; with `userId`, only that person's. */
  pending(tenantId?: string, userId?: string | null): Promise<QueuedReceipt[]>;
  /** Drop an expense's waiting receipts and their files (the expense was undone). */
  forget(clientRequestId: string): Promise<void>;
  /** A person tapped Try again on a marked photo: due now, attempts start over. */
  retryRefused(id: string): Promise<void>;
  /** A person removed one photo from the phone: forget it and delete its file. */
  dismiss(id: string): Promise<void>;
}

export function queuedReceiptId(receipt: Pick<QueuedReceipt, "tenantId" | "clientRequestId" | "fileUri">): string {
  return [receipt.tenantId, receipt.clientRequestId, receipt.fileUri].join("|");
}

const MIMES: readonly ReceiptMime[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function isQueuedReceipt(value: unknown): value is QueuedReceipt {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<QueuedReceipt>;
  return (
    typeof entry.id === "string" &&
    typeof entry.tenantId === "string" &&
    typeof entry.clientRequestId === "string" &&
    (entry.expenseId === null || typeof entry.expenseId === "string") &&
    typeof entry.fileUri === "string" &&
    MIMES.includes(entry.mime as ReceiptMime) &&
    typeof entry.attempts === "number" &&
    typeof entry.queuedAt === "number" &&
    (entry.userId === undefined || entry.userId === null || typeof entry.userId === "string") &&
    (entry.retryAt === undefined || entry.retryAt === null || typeof entry.retryAt === "number") &&
    (entry.refusedReason === undefined || entry.refusedReason === null || typeof entry.refusedReason === "string")
  );
}

/** What one pass did with an entry: sent (forget it), or the fields to keep on it. */
type ReceiptStep = { kind: "sent" } | { kind: "keep"; patch: Partial<QueuedReceipt> };

function stepFor(entry: QueuedReceipt, expenseId: string, answer: UploadAnswer, now: number): ReceiptStep {
  const verdict = typeof answer === "string" ? answer : answer.verdict;
  if (verdict === "sent") return { kind: "sent" };
  if (verdict === "offline") return { kind: "keep", patch: { expenseId } };
  const attempts = entry.attempts + 1;
  if (verdict === "drop") {
    const reason = typeof answer === "string" ? DEFAULT_REFUSAL : answer.reason;
    return { kind: "keep", patch: { expenseId, attempts, retryAt: null, refusedReason: reason } };
  }
  if (attempts >= MAX_RECEIPT_ATTEMPTS) {
    return { kind: "keep", patch: { expenseId, attempts, retryAt: null, refusedReason: RECEIPT_GAVE_UP_REASON } };
  }
  return { kind: "keep", patch: { expenseId, attempts, retryAt: nextExpenseRetryAt(now, attempts) } };
}

export function parseReceiptQueue(raw: string | null): QueuedReceipt[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQueuedReceipt) : [];
  } catch {
    return [];
  }
}

export function createReceiptQueue(deps: ReceiptQueueDeps): ReceiptQueue {
  const now = deps.now ?? Date.now;
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const result = chain.then(task, task);
    chain = result.catch(() => undefined);
    return result;
  }

  const read = async () => parseReceiptQueue(await deps.storage.getItem(EXPENSE_RECEIPT_STORAGE_KEY));
  const write = (entries: readonly QueuedReceipt[]) =>
    deps.storage.setItem(EXPENSE_RECEIPT_STORAGE_KEY, JSON.stringify(entries));
  const forget = (entries: readonly QueuedReceipt[]) =>
    Promise.all(entries.map((entry) => deps.deleteFile(entry.fileUri).catch(() => undefined)));

  // Entries picked by a running pass, so two passes never upload one photo twice.
  const picked = new Set<string>();
  const isDue = (entry: QueuedReceipt) => !entry.retryAt || entry.retryAt <= now();
  const isMine = (entry: QueuedReceipt, tenantId: string, userId: string | null | undefined) =>
    entry.tenantId === tenantId && belongsTo(entry, userId);

  /** One upload, outside the lock. Not landed yet / no answer = not an attempt. */
  const attempt = async (entry: QueuedReceipt): Promise<ReceiptStep> => {
    const expenseId = entry.expenseId ?? (await deps.resolveExpenseId(entry).catch(() => null));
    if (!expenseId) return { kind: "keep", patch: {} };
    const answer = await deps.upload(entry, expenseId).catch((): UploadAnswer => "offline");
    return stepFor(entry, expenseId, answer, now());
  };

  /** Writes one step back onto what is stored NOW (entries added or removed meanwhile survive). */
  const settle = (entry: QueuedReceipt, step: ReceiptStep) =>
    serial(async () => {
      const entries = await read();
      if (step.kind === "sent") {
        await write(entries.filter((stored) => stored.id !== entry.id));
        await forget([entry]);
        return;
      }
      if (!entries.some((stored) => stored.id === entry.id)) return;
      await write(entries.map((stored) => (stored.id === entry.id ? { ...stored, ...step.patch } : stored)));
    });

  return {
    enqueue: (receipt) =>
      serial(async () => {
        const fresh: QueuedReceipt = {
          ...receipt,
          userId: receipt.userId ?? null,
          id: queuedReceiptId(receipt),
          attempts: 0,
          queuedAt: now(),
          retryAt: null,
          refusedReason: null,
        };
        const existing = await read();
        const kept = existing.filter((entry) => entry.id !== fresh.id);
        const all = [...kept, fresh];
        const overflow = all.slice(0, Math.max(0, all.length - MAX_QUEUED_RECEIPTS));
        await write(all.slice(overflow.length));
        await forget(overflow);
      }),

    flush: async (tenantId, userId) => {
      const due = await serial(async () => {
        const entries = (await read()).filter(
          (entry) => isMine(entry, tenantId, userId) && !entry.refusedReason && isDue(entry) && !picked.has(entry.id),
        );
        for (const entry of entries) picked.add(entry.id);
        return entries;
      });
      try {
        for (const entry of due) await settle(entry, await attempt(entry));
      } finally {
        for (const entry of due) picked.delete(entry.id);
      }
      return serial(async () => (await read()).filter((entry) => isMine(entry, tenantId, userId) && !entry.refusedReason).length);
    },

    pending: (tenantId, userId) =>
      serial(async () => {
        const entries = await read();
        return entries.filter((entry) => (!tenantId || entry.tenantId === tenantId) && belongsTo(entry, userId));
      }),

    forget: (clientRequestId) =>
      serial(async () => {
        const entries = await read();
        const dropped = entries.filter((entry) => entry.clientRequestId === clientRequestId);
        if (dropped.length === 0) return;
        await write(entries.filter((entry) => entry.clientRequestId !== clientRequestId));
        await forget(dropped);
      }),

    retryRefused: (id) =>
      serial(async () => {
        const entries = await read();
        if (!entries.some((entry) => entry.id === id && entry.refusedReason)) return;
        await write(
          entries.map((entry) => (entry.id === id ? { ...entry, attempts: 0, retryAt: null, refusedReason: null } : entry)),
        );
      }),

    dismiss: (id) =>
      serial(async () => {
        const entries = await read();
        const dropped = entries.filter((entry) => entry.id === id);
        if (dropped.length === 0) return;
        await write(entries.filter((entry) => entry.id !== id));
        await forget(dropped);
      }),
  };
}

/** The mime of a picked file, from what the picker said or the file name. */
export function receiptMimeOf(fileName: string | null | undefined, reported: string | null | undefined): ReceiptMime | null {
  const fromPicker = (reported ?? "").toLowerCase();
  if (MIMES.includes(fromPicker as ReceiptMime)) return fromPicker as ReceiptMime;
  if (fromPicker === "image/jpg") return "image/jpeg";
  const ext = (fileName ?? "").toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return null;
}

export function extensionFor(mime: ReceiptMime): string {
  return mime === "application/pdf" ? "pdf" : mime.split("/")[1].replace("jpeg", "jpg");
}
