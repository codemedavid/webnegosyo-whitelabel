/**
 * EAS webhooks (https://docs.expo.dev/eas/webhooks/): one project webhook for
 * BUILD and one for SUBMIT, both posted when a build or submission COMPLETES
 * (finished / errored / canceled). Signed with `expo-signature: sha1=<hex>`,
 * an HMAC-SHA1 of the raw body keyed with the webhook secret. EAS retries
 * anything outside 200-399, so the route answers 200 to events it ignores.
 *
 * Pure (node:crypto only): the route checks the signature with
 * `verifyEasSignature`, then `readEasEvent` says what happened.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { buildIdFromMessage } from './manifest'
import { statusFromEas, type BuildStatus } from './status'

/** EAS refuses secrets shorter than 16 characters. */
export const MIN_WEBHOOK_SECRET_LENGTH = 16

export function easSignatureFor(rawBody: string, secret: string): string {
  return `sha1=${createHmac('sha1', secret).update(rawBody, 'utf8').digest('hex')}`
}

export function verifyEasSignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_WEBHOOK_SECRET_LENGTH || !header) return false
  const expected = Buffer.from(easSignatureFor(rawBody, secret), 'utf8')
  const given = Buffer.from(header.trim(), 'utf8')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const shortText = z.string().max(4000).optional().nullable()
const errorShape = z.object({ message: shortText, errorCode: shortText }).partial().optional().nullable()

/**
 * Only the fields we read; anything else EAS sends is dropped. Kept loose on
 * purpose (`.catch`) where EAS's shape is not documented as stable, so a new
 * EAS field can never turn a real finish into a 400 that EAS keeps retrying.
 */
export const easWebhookBodySchema = z.object({
  id: UUID,
  platform: z.string().max(20).optional(),
  status: z.string().max(40),
  // BUILD
  artifacts: z.object({ buildUrl: z.string().max(2000).optional().nullable() }).partial().optional().nullable().catch(null),
  metadata: z
    .object({
      appVersion: shortText,
      appBuildVersion: shortText,
      message: shortText,
      appIdentifier: shortText,
    })
    .partial()
    .optional()
    .nullable()
    .catch(null),
  error: errorShape.catch(null),
  // SUBMIT
  turtleBuildId: UUID.optional().nullable().catch(null),
  submissionInfo: z.object({ error: errorShape.catch(null) }).partial().optional().nullable().catch(null),
})

export type EasWebhookBody = z.infer<typeof easWebhookBodySchema>

export type EasEvent =
  | {
      kind: 'build'
      easBuildId: string
      /** From the build message we set (`wnb:<id>`), for a build whose EAS id never came back from CI. */
      buildId: string | null
      status: BuildStatus
      artifactUrl: string | null
      appVersion: string | null
      buildNumber: string | null
      error: string | null
    }
  | {
      kind: 'submit'
      easBuildId: string
      ok: boolean
      error: string | null
    }
  | { kind: 'ignored'; reason: string }

const clip = (text: string | null | undefined, max: number): string | null => {
  const value = typeof text === 'string' ? text.trim() : ''
  return value ? value.slice(0, max) : null
}

const httpsOrNull = (url: string | null | undefined): string | null =>
  typeof url === 'string' && /^https:\/\//.test(url) ? url.slice(0, 2000) : null

export function readEasEvent(body: EasWebhookBody): EasEvent {
  const status = statusFromEas(body.status)
  // A submission names the build it sent; a build never does.
  if (body.turtleBuildId) {
    if (status === null) return { kind: 'ignored', reason: `submission status ${body.status}` }
    const error = status === 'finished'
      ? null
      : clip(body.submissionInfo?.error?.message, 1500) ?? (status === 'cancelled' ? 'The submission was cancelled.' : 'The submission failed.')
    return { kind: 'submit', easBuildId: body.turtleBuildId.toLowerCase(), ok: status === 'finished', error }
  }
  if (status === null) return { kind: 'ignored', reason: `build status ${body.status}` }
  return {
    kind: 'build',
    easBuildId: body.id.toLowerCase(),
    buildId: buildIdFromMessage(body.metadata?.message),
    status,
    artifactUrl: status === 'finished' ? httpsOrNull(body.artifacts?.buildUrl) : null,
    appVersion: clip(body.metadata?.appVersion, 32),
    buildNumber: clip(body.metadata?.appBuildVersion, 32),
    error:
      status === 'errored'
        ? clip(body.error?.message, 1500) ?? 'The build failed on EAS.'
        : status === 'cancelled'
          ? 'The build was cancelled on EAS.'
          : null,
  }
}
