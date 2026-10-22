import { nextExpenseRetryAt } from "./expense-queue";
import {
  EXPENSE_RECEIPT_STORAGE_KEY,
  MAX_QUEUED_RECEIPTS,
  MAX_RECEIPT_ATTEMPTS,
  createReceiptQueue,
  extensionFor,
  parseReceiptQueue,
  receiptMimeOf,
  receiptRefusalReason,
  verdictForStatus,
  type NewQueuedReceipt,
  type QueuedReceipt,
  type ReceiptKeyValueStorage,
  type UploadVerdict,
} from "./receipt-queue";

function memoryStorage(): ReceiptKeyValueStorage & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => {
      data[key] = value;
    },
  };
}

function receipt(requestId: string, fileUri = `file:///r/${requestId}.jpg`, tenantId = "t1", userId?: string): NewQueuedReceipt {
  return { tenantId, clientRequestId: requestId, expenseId: null, fileUri, mime: "image/jpeg", ...(userId ? { userId } : {}) };
}

describe("verdictForStatus", () => {
  it("sends on 2xx, stops on what the server will never take, retries the rest", () => {
    expect(verdictForStatus(201)).toBe("sent");
    for (const status of [400, 403, 409, 413, 415, 422]) expect(verdictForStatus(status)).toBe("drop");
    for (const status of [401, 404, 429, 500, 503]) expect(verdictForStatus(status)).toBe("retry");
  });

  it("reads no answer at all as offline: not an attempt", () => {
    expect(verdictForStatus(null)).toBe("offline");
  });

  it("says in plain words why a photo was not taken", () => {
    for (const status of [400, 403, 409, 413, 415, 422]) expect(receiptRefusalReason(status)).toMatch(/\w/);
    expect(receiptRefusalReason(413)).toMatch(/too large/i);
  });
});

describe("receipt queue", () => {
  it("waits for the expense to land before uploading, then files it under the server id", async () => {
    // Arrange
    let landed: string | null = null;
    const upload = jest.fn(async (): Promise<UploadVerdict> => "sent");
    const deleteFile = jest.fn(async () => undefined);
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => landed,
      upload,
      deleteFile,
    });
    await queue.enqueue(receipt("req-1"));

    // Act: the expense is still offline.
    const waiting = await queue.flush("t1");

    // Assert
    expect(waiting).toBe(1);
    expect(upload).not.toHaveBeenCalled();

    landed = "srv-1";
    expect(await queue.flush("t1")).toBe(0);
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: "req-1" }), "srv-1");
    expect(deleteFile).toHaveBeenCalledWith("file:///r/req-1.jpg");
  });

  it("remembers the resolved id so a failed upload does not look the expense up again", async () => {
    const resolveExpenseId = jest.fn(async () => "srv-1");
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId,
      upload: async () => "retry",
      deleteFile: async () => undefined,
    });
    await queue.enqueue(receipt("req-1"));

    await queue.flush("t1");
    await queue.flush("t1");

    expect(resolveExpenseId).toHaveBeenCalledTimes(1);
    expect((await queue.pending())[0].expenseId).toBe("srv-1");
  });

  it("keeps the photo and marks it when the server will not take it, instead of deleting it silently", async () => {
    // Arrange
    const deleteFile = jest.fn(async () => undefined);
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv-1",
      upload: async () => ({ verdict: "drop" as const, reason: "The photo is too large to upload." }),
      deleteFile,
    });
    await queue.enqueue(receipt("req-1"));

    // Act
    const waiting = await queue.flush("t1");

    // Assert
    expect(waiting).toBe(0);
    expect(deleteFile).not.toHaveBeenCalled();
    const [kept] = await queue.pending();
    expect(kept.refusedReason).toBe("The photo is too large to upload.");
  });

  it("does not spend attempts while the expense has not reached the server (an hour offline and more)", async () => {
    let now = 0;
    const deleteFile = jest.fn(async () => undefined);
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => null,
      upload: async () => "sent",
      deleteFile,
      now: () => now,
    });
    await queue.enqueue(receipt("req-1"));

    for (let i = 0; i < MAX_RECEIPT_ATTEMPTS * 3; i += 1) {
      await queue.flush("t1");
      now += 60_000;
    }

    const [kept] = await queue.pending();
    expect(kept).toMatchObject({ attempts: 0, refusedReason: null });
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("does not spend attempts while the phone is offline", async () => {
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv-1",
      upload: async () => "offline",
      deleteFile: async () => undefined,
    });
    await queue.enqueue(receipt("req-1"));

    for (let i = 0; i < MAX_RECEIPT_ATTEMPTS + 5; i += 1) await queue.flush("t1");

    expect((await queue.pending())[0]).toMatchObject({ attempts: 0, refusedReason: null });
  });

  it("backs off after a failed upload and waits until it is due", async () => {
    let now = 10_000;
    const upload = jest.fn(async (): Promise<UploadVerdict> => "retry");
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv-1",
      upload,
      deleteFile: async () => undefined,
      now: () => now,
    });
    await queue.enqueue(receipt("req-1"));

    await queue.flush("t1");
    const [waiting] = await queue.pending();
    expect(waiting.retryAt).toBe(nextExpenseRetryAt(10_000, 1));
    await queue.flush("t1");
    expect(upload).toHaveBeenCalledTimes(1);

    now = waiting.retryAt as number;
    await queue.flush("t1");
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("after the attempt cap keeps the photo and marks it, never deleting it silently", async () => {
    let now = 0;
    const deleteFile = jest.fn(async () => undefined);
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv-1",
      upload: async () => "retry",
      deleteFile,
      now: () => now,
    });
    await queue.enqueue(receipt("req-1"));

    for (let i = 0; i < MAX_RECEIPT_ATTEMPTS + 5; i += 1) {
      await queue.flush("t1");
      now += 24 * 60 * 60_000;
    }

    const [kept] = await queue.pending();
    expect(kept.attempts).toBe(MAX_RECEIPT_ATTEMPTS);
    expect(kept.refusedReason).toMatch(/\w/);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("tries a marked photo again on Try again, and deletes it when removed", async () => {
    let answer: UploadVerdict = "drop";
    const deleteFile = jest.fn(async () => undefined);
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv-1",
      upload: async () => answer,
      deleteFile,
    });
    await queue.enqueue(receipt("a"));
    await queue.enqueue(receipt("b"));
    await queue.flush("t1");
    const [a, b] = await queue.pending();

    answer = "sent";
    await queue.retryRefused(a.id);
    await queue.flush("t1");
    await queue.dismiss(b.id);

    expect(await queue.pending()).toEqual([]);
    expect(deleteFile).toHaveBeenCalledWith("file:///r/a.jpg");
    expect(deleteFile).toHaveBeenCalledWith("file:///r/b.jpg");
  });

  it("only uploads the signed-in person's photos on a shared register", async () => {
    const upload = jest.fn<Promise<UploadVerdict>, [QueuedReceipt, string]>(async () => "sent");
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv",
      upload,
      deleteFile: async () => undefined,
    });
    await queue.enqueue(receipt("ana", "file:///ana.jpg", "t1", "ana"));
    await queue.enqueue(receipt("ben", "file:///ben.jpg", "t1", "ben"));

    await queue.flush("t1", "ben");

    expect(upload.mock.calls.map(([entry]) => entry.clientRequestId)).toEqual(["ben"]);
    expect((await queue.pending("t1", "ana")).map((entry) => entry.clientRequestId)).toEqual(["ana"]);
    expect(await queue.pending("t1", "ben")).toEqual([]);
  });

  it("keeps a new photo prompt while an earlier one is still uploading", async () => {
    let open: (verdict: UploadVerdict) => void = () => undefined;
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv",
      upload: () => new Promise<UploadVerdict>((resolve) => (open = resolve)),
      deleteFile: async () => undefined,
    });
    await queue.enqueue(receipt("first"));
    const flushing = queue.flush("t1");
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));

    await queue.enqueue(receipt("second"));
    open("sent");
    await flushing;

    expect((await queue.pending()).map((entry) => entry.clientRequestId)).toEqual(["second"]);
  });

  it("keeps at most the newest receipts and deletes the overflow's files", async () => {
    const storage = memoryStorage();
    const deleteFile = jest.fn(async () => undefined);
    const queue = createReceiptQueue({
      storage,
      resolveExpenseId: async () => null,
      upload: async () => "sent",
      deleteFile,
    });
    for (let i = 0; i <= MAX_QUEUED_RECEIPTS; i += 1) await queue.enqueue(receipt(`req-${i}`));

    const kept = parseReceiptQueue(storage.data[EXPENSE_RECEIPT_STORAGE_KEY]);
    expect(kept).toHaveLength(MAX_QUEUED_RECEIPTS);
    expect(kept[0].clientRequestId).toBe("req-1");
    expect(deleteFile).toHaveBeenCalledWith("file:///r/req-0.jpg");
  });

  it("does not touch another store's receipts", async () => {
    const upload = jest.fn(async (): Promise<UploadVerdict> => "sent");
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv",
      upload,
      deleteFile: async () => undefined,
    });
    await queue.enqueue(receipt("theirs", "file:///x.jpg", "t2"));

    await queue.flush("t1");

    expect(upload).not.toHaveBeenCalled();
    expect(await queue.pending("t2")).toHaveLength(1);
  });

  it("an upload that throws is kept, not lost", async () => {
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv",
      upload: async () => {
        throw new Error("Network request failed");
      },
      deleteFile: async () => undefined,
    });
    await queue.enqueue(receipt("req-1"));

    expect(await queue.flush("t1")).toBe(1);
  });
});

describe("receipt file types", () => {
  it("reads the mime from the picker, else the file name", () => {
    expect(receiptMimeOf("IMG_1.HEIC", "image/png")).toBe("image/png");
    expect(receiptMimeOf("photo.JPG", null)).toBe("image/jpeg");
    expect(receiptMimeOf(null, "image/jpg")).toBe("image/jpeg");
    expect(receiptMimeOf("bill.pdf", undefined)).toBe("application/pdf");
    expect(receiptMimeOf("clip.mov", "video/quicktime")).toBeNull();
  });

  it("names files with their real extension", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("application/pdf")).toBe("pdf");
  });
});

describe("forget", () => {
  it("drops an undone expense's receipts and deletes their files", async () => {
    const deleteFile = jest.fn(async () => undefined);
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => null,
      upload: async () => "sent",
      deleteFile,
    });
    await queue.enqueue(receipt("undone"));
    await queue.enqueue(receipt("kept"));

    await queue.forget("undone");

    expect((await queue.pending()).map((entry) => entry.clientRequestId)).toEqual(["kept"]);
    expect(deleteFile).toHaveBeenCalledWith("file:///r/undone.jpg");
  });
});
