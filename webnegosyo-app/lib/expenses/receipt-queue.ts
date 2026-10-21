/**
 * Receipt photos waiting to upload, modelled on `lib/gov-id-photos/photo-queue.ts`.
 *
 * A receipt can only be filed under a recorded expense (the route needs its
 * id), and an expense typed offline has no id until the expense queue lands
 * it. So an entry carries the expense's `client_request_id` and is resolved to
 * a server id on the way out; until then it simply waits.
 *
 * A receipt is optional — the expense counts without it — so the queue is
 * durable but not stubborn: it gives up on a file the server will never take
 * and after `MAX_RECEIPT_ATTEMPTS`, and ALWAYS deletes the local copy when it
 * lets go (receipts show supplier names and TINs; they must not pile up on a
 * shared register).
 *
 * Storage, id resolution, upload and file deletion are injected so this runs
 * under the node Jest project; `live-receipt-queue.ts` wires the real ones.
 */

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
  /** The expense's request id — always known, even offline. */
  clientRequestId: string;
  /** The server id, once known. */
  expenseId: string | null;
  fileUri: string;
  mime: ReceiptMime;
  attempts: number;
  queuedAt: number;
}

export type NewQueuedReceipt = Omit<QueuedReceipt, "id" | "attempts" | "queuedAt">;

/** What one upload attempt means for the entry. */
export type UploadVerdict = "sent" | "retry" | "drop";

/**
 * An HTTP answer (null = no answer: offline, timeout, no session) as a verdict.
 * 404 is "the expense is not readable yet" or "the route is not shipped yet":
 * both resolve with time. 401 is usually a token mid-refresh. 409 is "that
 * expense was voided" (or already holds its 10 receipts): it never changes.
 */
export function verdictForStatus(status: number | null): UploadVerdict {
  if (status === null) return "retry";
  if (status >= 200 && status < 300) return "sent";
  if ([400, 403, 409, 413, 415, 422].includes(status)) return "drop";
  return "retry";
}

export interface ReceiptKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ReceiptQueueDeps {
  storage: ReceiptKeyValueStorage;
  /** The server id for a request id; null = not landed yet. */
  resolveExpenseId(entry: QueuedReceipt): Promise<string | null>;
  upload(entry: QueuedReceipt, expenseId: string): Promise<UploadVerdict>;
  deleteFile(fileUri: string): Promise<void>;
  now?: () => number;
}

export interface ReceiptQueue {
  enqueue(receipt: NewQueuedReceipt): Promise<void>;
  /** Uploads what is waiting for this store; returns how many still wait. */
  flush(tenantId: string): Promise<number>;
  pending(tenantId?: string): Promise<QueuedReceipt[]>;
  /** Drop an expense's waiting receipts and their files (the expense was undone). */
  forget(clientRequestId: string): Promise<void>;
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
    typeof entry.queuedAt === "number"
  );
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

  return {
    enqueue: (receipt) =>
      serial(async () => {
        const fresh: QueuedReceipt = { ...receipt, id: queuedReceiptId(receipt), attempts: 0, queuedAt: now() };
        const existing = await read();
        const kept = existing.filter((entry) => entry.id !== fresh.id);
        const all = [...kept, fresh];
        const overflow = all.slice(0, Math.max(0, all.length - MAX_QUEUED_RECEIPTS));
        await write(all.slice(overflow.length));
        await forget(overflow);
      }),

    flush: (tenantId) =>
      serial(async () => {
        const entries = await read();
        const remaining: QueuedReceipt[] = [];
        const done: QueuedReceipt[] = [];
        for (const entry of entries) {
          if (entry.tenantId !== tenantId) {
            remaining.push(entry);
            continue;
          }
          const expenseId = entry.expenseId ?? (await deps.resolveExpenseId(entry).catch(() => null));
          const verdict: UploadVerdict = expenseId
            ? await deps.upload(entry, expenseId).catch((): UploadVerdict => "retry")
            : "retry";
          const attempts = entry.attempts + 1;
          if (verdict === "retry" && attempts < MAX_RECEIPT_ATTEMPTS) {
            remaining.push({ ...entry, expenseId, attempts });
          } else {
            done.push(entry);
          }
        }
        await write(remaining);
        await forget(done);
        return remaining.filter((entry) => entry.tenantId === tenantId).length;
      }),

    pending: (tenantId) =>
      serial(async () => {
        const entries = await read();
        return tenantId ? entries.filter((entry) => entry.tenantId === tenantId) : entries;
      }),

    forget: (clientRequestId) =>
      serial(async () => {
        const entries = await read();
        const dropped = entries.filter((entry) => entry.clientRequestId === clientRequestId);
        if (dropped.length === 0) return;
        await write(entries.filter((entry) => entry.clientRequestId !== clientRequestId));
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
