/**
 * Deleting ID photos once they are 90 days old.
 *
 * Objects go first, through the Storage API (Supabase refuses DELETEs on
 * storage.objects), then their rows. If removing objects fails the rows stay,
 * so the next run tries again; RLS already hides an expired row from every
 * reviewer, so a late purge never makes an old photo viewable.
 */

export interface ExpiredIdPhoto {
  id: string
  objectPath: string
}

export interface IdPhotoPurgeStore {
  listExpired(nowIso: string, limit: number): Promise<ExpiredIdPhoto[]>
  removeObjects(paths: readonly string[]): Promise<void>
  deleteRows(ids: readonly string[]): Promise<void>
}

export const PURGE_BATCH_SIZE = 100
export const MAX_PURGE_BATCHES = 10

export async function purgeExpiredIdPhotos(
  store: IdPhotoPurgeStore,
  now: Date,
  batchSize = PURGE_BATCH_SIZE,
  maxBatches = MAX_PURGE_BATCHES,
): Promise<{ deleted: number; hasMore: boolean }> {
  let deleted = 0
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const expired = await store.listExpired(now.toISOString(), batchSize)
    if (expired.length === 0) return { deleted, hasMore: false }
    await store.removeObjects(expired.map((photo) => photo.objectPath))
    await store.deleteRows(expired.map((photo) => photo.id))
    deleted += expired.length
    if (expired.length < batchSize) return { deleted, hasMore: false }
  }
  return { deleted, hasMore: true }
}
