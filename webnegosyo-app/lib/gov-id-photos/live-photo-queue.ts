/**
 * The device's ID-photo queue on AsyncStorage, uploading with the cashier's
 * own session token. Loaded lazily by its callers so logic tests never pull
 * in the native modules behind it.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";
import { deletePhotoFile, listPhotoFiles, readPhotoBase64 } from "./files";
import {
  GOV_ID_PHOTO_ROUTE,
  createIdPhotoQueue,
  orphanPhotoFiles,
  verdictForStatus,
  type IdPhotoQueue,
  type NewQueuedIdPhoto,
  type UploadVerdict,
} from "./photo-queue";
import type { QueuedIdPhoto } from "./types";

/** A photo is a few MB over a counter's connection: longer than a JSON post. */
const UPLOAD_TIMEOUT_MS = 30_000;

async function postPhoto(body: unknown): Promise<number | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, UPLOAD_TIMEOUT_MS);
  });
  try {
    const token = await Promise.race([getAccessTokenBounded(UPLOAD_TIMEOUT_MS), expiry]);
    if (!token) return null;
    const response = await Promise.race([
      fetch(`${getWebAppUrl()}${GOV_ID_PHOTO_ROUTE}`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      expiry,
    ]);
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadEntry(entry: QueuedIdPhoto): Promise<UploadVerdict> {
  const base64 = await readPhotoBase64(entry.fileUri);
  // The file is gone (storage cleared): nothing left to send.
  if (!base64) return "drop";
  const status = await postPhoto({
    tenantId: entry.tenantId,
    backend: entry.backend,
    externalOrderId: entry.externalOrderId,
    claimantRef: entry.claimantRef,
    capturedAt: entry.capturedAt,
    photo: `data:image/jpeg;base64,${base64}`,
  });
  return verdictForStatus(status);
}

let queue: IdPhotoQueue | null = null;

export function liveIdPhotoQueue(): IdPhotoQueue {
  queue ??= createIdPhotoQueue({ storage: AsyncStorage, upload: uploadEntry, deleteFile: deletePhotoFile });
  return queue;
}

/** Deletes photos a removed claimant or an abandoned sale left behind. */
async function sweepOrphans(): Promise<void> {
  const listing = await listPhotoFiles();
  if (!listing) return;
  const waiting = (await liveIdPhotoQueue().pending()).map((entry) => entry.fileUri);
  const orphans = orphanPhotoFiles(listing.names, waiting, Date.now());
  await Promise.all(orphans.map((name) => deletePhotoFile(`${listing.folder}${name}`).catch(() => undefined)));
}

/**
 * Queue the sale's photos, then try to send everything waiting. Never throws:
 * the sale is done, and a photo is optional.
 */
export async function queueSaleIdPhotos(photos: readonly NewQueuedIdPhoto[]): Promise<void> {
  try {
    const photoQueue = liveIdPhotoQueue();
    await photoQueue.enqueue(photos);
    await photoQueue.flush();
  } catch {
    // Kept on the device by `enqueue`; the next flush retries it.
  }
}

/** Retry waiting photos and clear abandoned ones (the register's open/refresh). */
export async function flushIdPhotos(): Promise<void> {
  try {
    await liveIdPhotoQueue().flush();
    await sweepOrphans();
  } catch {
    // Best effort; the next open tries again.
  }
}
