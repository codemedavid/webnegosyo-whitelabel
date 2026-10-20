import {
  GOV_ID_PHOTO_STORAGE_KEY,
  MAX_PHOTO_ATTEMPTS,
  MAX_QUEUED_PHOTOS,
  createIdPhotoQueue,
  orphanPhotoFiles,
  parsePhotoQueue,
  verdictForStatus,
  type NewQueuedIdPhoto,
  type UploadVerdict,
} from "./photo-queue";
import type { QueuedIdPhoto } from "./types";

const NOW = Date.parse("2026-10-14T04:00:00.000Z");

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const photo = (overrides: Partial<NewQueuedIdPhoto> = {}): NewQueuedIdPhoto => ({
  tenantId: "t",
  backend: "platform_supabase",
  externalOrderId: "order-1",
  claimantRef: "c1",
  fileUri: "file:///doc/gov-id-photos/c1-1760414000000.jpg",
  capturedAt: "2026-10-14T03:59:00.000Z",
  ...overrides,
});

function setup(verdicts: UploadVerdict[] = []) {
  const storage = memoryStorage();
  const answers = [...verdicts];
  const upload = jest.fn<Promise<UploadVerdict>, [QueuedIdPhoto]>(async () => answers.shift() ?? "sent");
  const deleteFile = jest.fn<Promise<void>, [string]>(async () => undefined);
  const queue = createIdPhotoQueue({ storage, upload, deleteFile, now: () => NOW });
  return { storage, upload, deleteFile, queue };
}

describe("verdictForStatus", () => {
  it.each([
    [200, "sent"],
    [null, "retry"],
    [409, "retry"],
    [401, "retry"],
    [404, "retry"],
    [429, "retry"],
    [500, "retry"],
    [400, "drop"],
    [403, "drop"],
    [410, "drop"],
    [413, "drop"],
  ])("%p → %p", (status, verdict) => {
    expect(verdictForStatus(status)).toBe(verdict);
  });
});

describe("the ID photo queue", () => {
  it("uploads a queued photo and deletes the file once it is sent", async () => {
    const { queue, upload, deleteFile, storage } = setup(["sent"]);
    await queue.enqueue([photo()]);
    expect(await queue.flush()).toBe(0);
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ externalOrderId: "order-1", claimantRef: "c1", attempts: 0 }));
    expect(deleteFile).toHaveBeenCalledWith("file:///doc/gov-id-photos/c1-1760414000000.jpg");
    expect(parsePhotoQueue(storage.values.get(GOV_ID_PHOTO_STORAGE_KEY) ?? null)).toEqual([]);
  });

  it("keeps a photo whose grant is not filed yet, and counts the try", async () => {
    const { queue, deleteFile } = setup(["retry"]);
    await queue.enqueue([photo()]);
    expect(await queue.flush()).toBe(1);
    expect((await queue.pending())[0].attempts).toBe(1);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("gives up — and deletes the file — on a photo the server will never take", async () => {
    const { queue, deleteFile } = setup(["drop"]);
    await queue.enqueue([photo()]);
    expect(await queue.flush()).toBe(0);
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last attempt", async () => {
    const { queue, storage, deleteFile } = setup(["retry"]);
    await queue.enqueue([photo()]);
    const [entry] = await queue.pending();
    await storage.setItem(GOV_ID_PHOTO_STORAGE_KEY, JSON.stringify([{ ...entry, attempts: MAX_PHOTO_ATTEMPTS - 1 }]));
    expect(await queue.flush()).toBe(0);
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });

  it("never uploads a photo past its 90 days — it deletes it", async () => {
    const { queue, upload, deleteFile } = setup();
    await queue.enqueue([photo({ capturedAt: "2026-07-01T00:00:00.000Z" })]);
    expect(await queue.flush()).toBe(0);
    expect(upload).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });

  it("a retake for the same order and claimant replaces the waiting photo and deletes the old file", async () => {
    const { queue, deleteFile } = setup();
    await queue.enqueue([photo()]);
    await queue.enqueue([photo({ fileUri: "file:///doc/gov-id-photos/c1-1760414100000.jpg" })]);
    const pending = await queue.pending();
    expect(pending.map((entry) => entry.fileUri)).toEqual(["file:///doc/gov-id-photos/c1-1760414100000.jpg"]);
    expect(deleteFile).toHaveBeenCalledWith("file:///doc/gov-id-photos/c1-1760414000000.jpg");
  });

  it("caps the queue, deleting the oldest photos' files", async () => {
    const { queue, deleteFile } = setup();
    const many = Array.from({ length: MAX_QUEUED_PHOTOS + 2 }, (_, index) =>
      photo({ claimantRef: `c${index}`, fileUri: `file:///p/c${index}-1760414000000.jpg` }),
    );
    await queue.enqueue(many);
    expect(await queue.pending()).toHaveLength(MAX_QUEUED_PHOTOS);
    expect(deleteFile.mock.calls.map(([uri]) => uri)).toEqual(["file:///p/c0-1760414000000.jpg", "file:///p/c1-1760414000000.jpg"]);
  });

  it("survives a damaged queue", () => {
    expect(parsePhotoQueue("not json")).toEqual([]);
    expect(parsePhotoQueue(JSON.stringify([{ id: 1 }]))).toEqual([]);
  });
});

describe("orphanPhotoFiles", () => {
  it("deletes only files nothing waits for that are a day old (or unnamed)", () => {
    const dayAgo = NOW - 24 * 60 * 60 * 1000;
    const names = [`a-${dayAgo}.jpg`, `b-${NOW - 1000}.jpg`, `c-${dayAgo}.jpg`, "stray.jpg"];
    const queued = [`file:///doc/gov-id-photos/c-${dayAgo}.jpg`];
    expect(orphanPhotoFiles(names, queued, NOW)).toEqual([`a-${dayAgo}.jpg`, "stray.jpg"]);
  });
});
