/**
 * Which grants have an ID photo the reviewer may open.
 *
 * A photo belongs to an order and a claimant on it, not to a revision, so an
 * edited order's later grants still lead to the photo taken at the sale.
 */

import { idPhotoKey } from '@/lib/gov-discount-ledger/id-photos/rules'
import type { IdPhotoRef } from './types'

interface GrantKey {
  id: string
  backend: string
  externalOrderId: string
  claimantRef: string
}

/** Grant id → photo id, for the grants that have one. */
export function photoIdsByGrant(
  grants: readonly GrantKey[],
  photos: readonly IdPhotoRef[],
): Readonly<Record<string, string>> {
  if (photos.length === 0) return {}
  const byKey = new Map(photos.map((photo) => [idPhotoKey(photo.backend, photo.externalOrderId, photo.claimantRef), photo.id]))
  return Object.fromEntries(
    grants.flatMap((grant) => {
      const photoId = byKey.get(idPhotoKey(grant.backend, grant.externalOrderId, grant.claimantRef))
      return photoId ? [[grant.id, photoId]] : []
    }),
  )
}
