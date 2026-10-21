import {
  EXPENSE_RECEIPT_STORAGE_KEY,
  MAX_QUEUED_RECEIPTS,
  MAX_RECEIPT_ATTEMPTS,
  createReceiptQueue,
  extensionFor,
  parseReceiptQueue,
  receiptMimeOf,
  verdictForStatus,
  type NewQueuedReceipt,
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

function receipt(requestId: string, fileUri = `file:///r/${requestId}.jpg`, tenantId = "t1"): NewQueuedReceipt {
  return { tenantId, clientRequestId: requestId, expenseId: null, fileUri, mime: "image/jpeg" };
}

describe("verdictForStatus", () => {
  it("sends on 2xx, drops what the server will never take, retries the rest", () => {
    expect(verdictForStatus(201)).toBe("sent");
    for (const status of [400, 403, 409, 413, 415, 422]) expect(verdictForStatus(status)).toBe("drop");
    for (const status of [null, 401, 404, 429, 500, 503]) expect(verdictForStatus(status)).toBe("retry");
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

  it("deletes the file when the server refuses it for good", async () => {
    const deleteFile = jest.fn(async () => undefined);
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => "srv-1",
      upload: async () => "drop",
      deleteFile,
    });
    await queue.enqueue(receipt("req-1"));

    expect(await queue.flush("t1")).toBe(0);
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt cap and still deletes the file", async () => {
    const deleteFile = jest.fn(async () => undefined);
    const queue = createReceiptQueue({
      storage: memoryStorage(),
      resolveExpenseId: async () => null,
      upload: async () => "sent",
      deleteFile,
    });
    await queue.enqueue(receipt("req-1"));

    for (let i = 0; i < MAX_RECEIPT_ATTEMPTS; i += 1) await queue.flush("t1");

    expect(await queue.pending()).toEqual([]);
    expect(deleteFile).toHaveBeenCalledWith("file:///r/req-1.jpg");
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

  it("an upload that throws is retried, not lost", async () => {
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
