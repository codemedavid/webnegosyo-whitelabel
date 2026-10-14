/**
 * Request bodies for the Senior/PWD routes, parsed strictly.
 *
 * The actor (who gave or approved a discount) is NEVER read from a body — it
 * comes from the verified token. A body that tries to name one is refused.
 */

import { z } from 'zod'
import {
  MAX_LEDGER_LINES,
  readStoredGovDiscount,
  type RecordGovDiscountRequest,
} from '@/lib/gov-discount'
import { MAX_ID_PHOTO_DATA_URL_CHARS } from './id-photos/rules'
import type { IdPhotoUploadRequest } from './id-photos/upload-service'

const uuid = z.string().uuid()
const money = z.number().finite().min(0).max(10_000_000)

const lineSchema = z.object({
  key: z.string().min(1).max(200),
  menuItemId: z.string().max(64).nullable(),
  name: z.string().max(200),
  quantity: z.number().int().min(1).max(10_000),
  amount: money,
})

const recordSchema = z
  .object({
    tenantId: uuid,
    backend: z.enum(['convex', 'tenant_supabase', 'platform_supabase']),
    externalOrderId: z.string().min(1).max(128),
    orderLabel: z.string().max(40).nullable().default(null),
    outletId: uuid.nullable().default(null),
    revision: z.number().int().min(0).max(10_000),
    occurredAt: z.string().datetime({ offset: true }),
    orderTotal: money,
    source: z.enum(['pos', 'online']),
    lines: z.array(lineSchema).max(MAX_LEDGER_LINES),
    serviceCharge: money.default(0),
    deliveryFee: money.default(0),
    allowShared: z.boolean(),
    government: z.unknown(),
    approvalId: uuid.nullable().default(null),
    approvalSkippedOffline: z.boolean().default(false),
  })
  .strict()

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request.'
}

export function parseRecordRequest(body: unknown): ParseResult<RecordGovDiscountRequest> {
  const parsed = recordSchema.safeParse(body)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const { government: rawGovernment, ...rest } = parsed.data
  const government = rawGovernment === null ? null : readStoredGovDiscount(rawGovernment)
  if (rawGovernment !== null && !government) {
    return { ok: false, error: 'government: not a valid Senior/PWD discount block.' }
  }
  return { ok: true, value: { ...rest, government } }
}

const approveSchema = z
  .object({
    tenantId: uuid,
    approverUserId: uuid,
    pin: z.string().regex(/^[0-9]{4,6}$/, 'PIN must be 4 to 6 digits'),
    reduction: money,
    outletId: uuid.nullable().default(null),
    claimants: z
      .array(
        z.object({
          kind: z.enum(['senior', 'pwd', 'athlete', 'medal_of_valor']),
          name: z.string().max(80),
          idMasked: z.string().max(20),
        }),
      )
      .min(1)
      .max(20),
  })
  .strict()

export type ApproveRequest = z.infer<typeof approveSchema>

export function parseApproveRequest(body: unknown): ParseResult<ApproveRequest> {
  const parsed = approveSchema.safeParse(body)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: firstIssue(parsed.error) }
}

const pinSchema = z
  .object({
    tenantId: uuid,
    pin: z.string().regex(/^[0-9]{4,6}$/, 'PIN must be 4 to 6 digits'),
  })
  .strict()

export type SetPinRequest = z.infer<typeof pinSchema>

export function parseSetPinRequest(body: unknown): ParseResult<SetPinRequest> {
  const parsed = pinSchema.safeParse(body)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: firstIssue(parsed.error) }
}

/** Obvious PINs a manager should not pick. */
const WEAK_PINS = new Set(['0000', '1111', '1234', '4321', '123456', '654321', '000000', '111111', '1212', '2580'])

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin) || /^(\d)\1+$/.test(pin)
}

const idPhotoUploadSchema = z
  .object({
    tenantId: uuid,
    backend: z.enum(['convex', 'tenant_supabase', 'platform_supabase']),
    externalOrderId: z.string().min(1).max(128),
    claimantRef: z.string().min(1).max(128),
    capturedAt: z.string().datetime({ offset: true }),
    // Checked byte-for-byte by `decodePhotoDataUrl`; this only bounds the parse.
    photo: z.string().min(1).max(MAX_ID_PHOTO_DATA_URL_CHARS),
  })
  .strict()

export function parseIdPhotoUploadRequest(body: unknown): ParseResult<IdPhotoUploadRequest> {
  const parsed = idPhotoUploadSchema.safeParse(body)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: firstIssue(parsed.error) }
}

const idPhotoLinkSchema = z.object({ tenantId: uuid, photoId: uuid }).strict()

export type IdPhotoLinkRequest = z.infer<typeof idPhotoLinkSchema>

export function parseIdPhotoLinkRequest(body: unknown): ParseResult<IdPhotoLinkRequest> {
  const parsed = idPhotoLinkSchema.safeParse(body)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: firstIssue(parsed.error) }
}
