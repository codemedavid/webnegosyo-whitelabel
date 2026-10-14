/**
 * Which grants have an ID photo the reviewer may open — matched by order and
 * claimant, not revision, so an edited order still leads to the photo taken
 * at the sale. Mirrors the web's `gov-discount-reports/id-photos.ts`.
 */

/** An ID photo the reviewer may open (RLS: reviewers only, unexpired). */
export interface IdPhotoRef {
  id: string;
  backend: string;
  externalOrderId: string;
  claimantRef: string;
}

interface GrantKey {
  id: string;
  backend: string;
  externalOrderId: string;
  claimantRef: string;
}

const keyOf = (backend: string, orderId: string, claimantRef: string) => `${backend}|${orderId}|${claimantRef}`;

/** Grant id → photo id, for the grants that have one. */
export function photoIdsByGrant(
  grants: readonly GrantKey[],
  photos: readonly IdPhotoRef[],
): Readonly<Record<string, string>> {
  if (photos.length === 0) return {};
  const byKey = new Map(photos.map((photo) => [keyOf(photo.backend, photo.externalOrderId, photo.claimantRef), photo.id]));
  return Object.fromEntries(
    grants.flatMap((grant) => {
      const photoId = byKey.get(keyOf(grant.backend, grant.externalOrderId, grant.claimantRef));
      return photoId ? [[grant.id, photoId]] : [];
    }),
  );
}
