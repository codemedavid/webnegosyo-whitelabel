/**
 * The device's queue of Senior/PWD ID photos waiting to upload.
 *
 * Unlike the sales-book record, a photo is optional: losing one costs nothing
 * the law asks for. So the queue is durable but not stubborn — it gives up on
 * a photo the server will never take (store switched photos off, past the 90
 * days, not an image) and after `MAX_PHOTO_ATTEMPTS`, and it ALWAYS deletes
 * the file when it lets go of an entry: an ID photo must not linger on a
 * shared register.
 *
 * Storage, upload and file deletion are injected so this is testable without
 * a device; `live-photo-queue.ts` wires the real ones.
 */

import { ID_PHOTO_RETENTION_DAYS } from "../gov-discount";
import type { QueuedIdPhoto } from "./types";

export const GOV_ID_PHOTO_STORAGE_KEY = "wn-gov-id-photo-queue-v1";
export const GOV_ID_PHOTO_ROUTE = "/api/gov-discounts/id-photos";
export const MAX_PHOTO_ATTEMPTS = 40;
export const MAX_QUEUED_PHOTOS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = ID_PHOTO_RETENTION_DAYS * DAY_MS;

/** What one upload attempt means for the entry. */
export type UploadVerdict = "sent" | "retry" | "drop";

/**
 * An HTTP answer (null = no answer: offline, timeout, no session) as a verdict.
 * 409 is "the grant is not recorded yet"; 401 is usually a token mid-refresh;
 * 404 means the web app has not shipped the route yet.
 */
export function verdictForStatus(status: number | null): UploadVerdict {
  if (status === null) return "retry";
  if (status >= 200 && status < 300) return "sent";
  if (status === 400 || status === 403 || status === 410 || status === 413) return "drop";
  return "retry";
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface PhotoQueueDeps {
  storage: KeyValueStorage;
  upload(entry: QueuedIdPhoto): Promise<UploadVerdict>;
  deleteFile(fileUri: string): Promise<void>;
  now?: () => number;
}

export type NewQueuedIdPhoto = Omit<QueuedIdPhoto, "id" | "attempts" | "queuedAt">;

export function queuedPhotoId(photo: Pick<QueuedIdPhoto, "tenantId" | "backend" | "externalOrderId" | "claimantRef">): string {
  return [photo.tenantId, photo.backend, photo.externalOrderId, photo.claimantRef].join("|");
}

function isQueuedPhoto(value: unknown): value is QueuedIdPhoto {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<QueuedIdPhoto>;
  return (
    typeof entry.id === "string" &&
    typeof entry.fileUri === "string" &&
    typeof entry.capturedAt === "string" &&
    typeof entry.tenantId === "string" &&
    typeof entry.externalOrderId === "string" &&
    typeof entry.claimantRef === "string" &&
    typeof entry.attempts === "number" &&
    typeof entry.queuedAt === "number"
  );
}

export function parsePhotoQueue(raw: string | null): QueuedIdPhoto[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQueuedPhoto) : [];
  } catch {
    return [];
  }
}

/** Past the 90 days: the server would refuse it, and the file must go. */
export function isPhotoPastRetention(capturedAt: string, nowMs: number): boolean {
  const capturedMs = Date.parse(capturedAt);
  return !Number.isFinite(capturedMs) || nowMs - capturedMs >= RETENTION_MS;
}

export interface IdPhotoQueue {
  enqueue(photos: readonly NewQueuedIdPhoto[]): Promise<void>;
  /** Uploads what is waiting; returns how many are still waiting. */
  flush(): Promise<number>;
  pending(): Promise<QueuedIdPhoto[]>;
}

export function createIdPhotoQueue(deps: PhotoQueueDeps): IdPhotoQueue {
  const now = deps.now ?? Date.now;
  // Serialised, so a flush and an enqueue racing never lose an entry.
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  }

  const read = async () => parsePhotoQueue(await deps.storage.getItem(GOV_ID_PHOTO_STORAGE_KEY));
  const write = (entries: readonly QueuedIdPhoto[]) =>
    deps.storage.setItem(GOV_ID_PHOTO_STORAGE_KEY, JSON.stringify(entries));
  const forget = (entries: readonly QueuedIdPhoto[]) =>
    Promise.all(entries.map((entry) => deps.deleteFile(entry.fileUri).catch(() => undefined)));

  return {
    enqueue: (photos) =>
      serial(async () => {
        if (photos.length === 0) return;
        const incoming = photos.map((photo) => ({
          ...photo,
          id: queuedPhotoId(photo),
          attempts: 0,
          queuedAt: now(),
        }));
        const incomingIds = new Set(incoming.map((entry) => entry.id));
        const existing = await read();
        // A retake replaces the waiting photo; its old file goes.
        const replaced = existing.filter(
          (entry) => incomingIds.has(entry.id) && !incoming.some((next) => next.fileUri === entry.fileUri),
        );
        const kept = existing.filter((entry) => !incomingIds.has(entry.id));
        const all = [...kept, ...incoming];
        const overflow = all.slice(0, Math.max(0, all.length - MAX_QUEUED_PHOTOS));
        await write(all.slice(overflow.length));
        await forget([...replaced, ...overflow]);
      }),

    flush: () =>
      serial(async () => {
        const entries = await read();
        const remaining: QueuedIdPhoto[] = [];
        const done: QueuedIdPhoto[] = [];
        for (const entry of entries) {
          if (isPhotoPastRetention(entry.capturedAt, now())) {
            done.push(entry);
            continue;
          }
          const verdict = await deps.upload(entry).catch((): UploadVerdict => "retry");
          const attempts = entry.attempts + 1;
          if (verdict === "retry" && attempts < MAX_PHOTO_ATTEMPTS) {
            remaining.push({ ...entry, attempts });
          } else {
            done.push(entry);
          }
        }
        await write(remaining);
        await forget(done);
        return remaining.length;
      }),

    pending: () => serial(read),
  };
}

/** Photo files are named `<claimant>-<epoch ms>.jpg` (see `capture.ts`). */
export function photoFileTakenAt(fileName: string): number | null {
  const match = /-(\d{10,})\.(?:jpg|jpeg)$/i.exec(fileName);
  return match ? Number(match[1]) : null;
}

/** Abandoned photos (a removed claimant, a cancelled sale) older than this are deleted. */
export const ORPHAN_PHOTO_AGE_MS = DAY_MS;

/**
 * Files in the photo folder nothing is waiting for and that are old enough
 * that no sale in progress can still want them.
 */
export function orphanPhotoFiles(
  fileNames: readonly string[],
  queuedFileUris: readonly string[],
  nowMs: number,
): string[] {
  const queued = new Set(queuedFileUris.map((uri) => uri.split("/").pop() ?? uri));
  return fileNames.filter((name) => {
    if (queued.has(name)) return false;
    const takenAt = photoFileTakenAt(name);
    return takenAt === null || nowMs - takenAt >= ORPHAN_PHOTO_AGE_MS;
  });
}
