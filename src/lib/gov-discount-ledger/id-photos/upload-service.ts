/**
 * Storing one optional Senior/PWD ID photo the register took.
 *
 * The caller is a verified member of the store holding `pos` (the route checks
 * the token and the permission). A branch-locked account may file a photo
 * only on its own branch's grants, and a photo already on file is replaced
 * only by whoever took it or by someone who reviews discounts — a cashier
 * cannot overwrite a colleague's evidence.
 * The photo is accepted only when the store has photos switched on, it is
 * still inside the 90-day retention, and the sales book already holds a grant
 * for that order and claimant — so a photo can never be filed against an
 * order of another store or a claim that does not exist. A grant the register
 * has not recorded YET answers `claim_pending`, which the register retries.
 *
 * Storage is injected so the rules are testable without Supabase.
 */

import type { GovLedgerBackend, IdPhotoMode } from '@/lib/gov-discount'
import { decodePhotoDataUrl, idPhotoObjectPath, isPastRetention } from './rules'

export interface IdPhotoUploadRequest {
  tenantId: string
  backend: GovLedgerBackend
  externalOrderId: string
  claimantRef: string
  capturedAt: string
  /** `data:image/jpeg;base64,…` */
  photo: string
}

export interface IdPhotoRowWrite {
  tenant_id: string
  outlet_id: string | null
  backend: GovLedgerBackend
  external_order_id: string
  claimant_ref: string
  object_path: string
  captured_at: string
  uploaded_by: string
}

export interface IdPhotoStore {
  loadPhotoMode(tenantId: string): Promise<IdPhotoMode>
  /** The grant this photo belongs to, or null when the sales book has none (yet). */
  findGrant(tenantId: string, backend: GovLedgerBackend, externalOrderId: string, claimantRef: string): Promise<{ outletId: string | null } | null>
  findPhoto(
    tenantId: string,
    backend: GovLedgerBackend,
    externalOrderId: string,
    claimantRef: string,
  ): Promise<{ path: string; uploadedBy: string | null } | null>
  putObject(path: string, bytes: Buffer, contentType: string): Promise<void>
  /** Insert, or replace the claimant's earlier photo (a retake). */
  savePhoto(row: IdPhotoRowWrite): Promise<void>
  removeObjects(paths: readonly string[]): Promise<void>
}

/** Who is uploading, as the route resolved them. */
export interface IdPhotoUploader {
  userId: string
  /** The branch a branch-locked account is confined to; null = store-wide. */
  branchOutletId: string | null
  /** Holds `discount_review` (or is the owner): may replace anyone's photo. */
  mayReplaceAny: boolean
}

export type IdPhotoRefusalCode =
  | 'photos_off'
  | 'expired'
  | 'invalid_photo'
  | 'too_large'
  | 'claim_pending'
  | 'wrong_branch'
  | 'replace_refused'

type RefusalStatus = 400 | 403 | 409 | 410 | 413

export type IdPhotoUploadOutcome =
  | { ok: true; replaced: boolean }
  | { ok: false; status: RefusalStatus; code: IdPhotoRefusalCode; error: string }

function refuse(
  status: RefusalStatus,
  code: IdPhotoRefusalCode,
  error: string,
): IdPhotoUploadOutcome {
  return { ok: false, status, code, error }
}

export async function uploadIdPhoto(
  store: IdPhotoStore,
  request: IdPhotoUploadRequest,
  uploader: IdPhotoUploader,
  now: Date,
  newPhotoId: () => string,
): Promise<IdPhotoUploadOutcome> {
  if ((await store.loadPhotoMode(request.tenantId)) !== 'optional') {
    return refuse(410, 'photos_off', 'This store does not keep ID photos.')
  }
  if (isPastRetention(request.capturedAt, now.getTime())) {
    return refuse(410, 'expired', 'This photo is older than the store keeps ID photos.')
  }

  const decoded = decodePhotoDataUrl(request.photo)
  if (!decoded.ok) {
    return decoded.reason === 'too_large'
      ? refuse(413, 'too_large', 'The photo is too large.')
      : refuse(400, 'invalid_photo', 'That is not a photo the store can keep.')
  }

  const { tenantId, backend, externalOrderId, claimantRef } = request
  const grant = await store.findGrant(tenantId, backend, externalOrderId, claimantRef)
  if (!grant) return refuse(409, 'claim_pending', 'The discount is not in the sales book yet. Try again shortly.')
  if (uploader.branchOutletId !== null && grant.outletId !== uploader.branchOutletId) {
    return refuse(403, 'wrong_branch', 'This discount was given at another branch.')
  }

  const previous = await store.findPhoto(tenantId, backend, externalOrderId, claimantRef)
  if (previous && previous.uploadedBy !== uploader.userId && !uploader.mayReplaceAny) {
    return refuse(403, 'replace_refused', 'Another staff member already filed this ID photo.')
  }
  const previousPath = previous?.path ?? null
  const { photo } = decoded
  const path = idPhotoObjectPath(tenantId, newPhotoId(), photo.extension)
  await store.putObject(path, photo.bytes, photo.contentType)

  try {
    await store.savePhoto({
      tenant_id: tenantId,
      outlet_id: grant.outletId,
      backend,
      external_order_id: externalOrderId,
      claimant_ref: claimantRef,
      object_path: path,
      captured_at: request.capturedAt,
      uploaded_by: uploader.userId,
    })
  } catch (error) {
    // No row points at the new object: take it back out rather than leave an
    // unreachable ID photo in the bucket.
    await store.removeObjects([path]).catch(() => undefined)
    throw error
  }

  if (previousPath && previousPath !== path) {
    // The row now points at the retake; the old picture must not linger.
    await store.removeObjects([previousPath]).catch((error: unknown) => {
      console.error('[gov-discounts/id-photos] old photo not removed; the purge will retry', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
  return { ok: true, replaced: previousPath !== null }
}
