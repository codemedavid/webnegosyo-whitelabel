/**
 * The release policy the superadmin submits, validated at the server boundary.
 *
 * The two versions in a row are a live gate on every merchant's app, so the
 * validation here is not cosmetic: a minimum above the newest shipped build
 * locks every merchant out of their register with no version able to clear it.
 * That one combination is refused here, refused again by a CHECK constraint on
 * the table, and refused a third time by the app when it reads the row back.
 */
import { z } from 'zod'

export const APP_RELEASE_PLATFORMS = ['ios', 'android'] as const
export type AppReleasePlatform = (typeof APP_RELEASE_PLATFORMS)[number]

export const MAX_RELEASE_NOTES_LENGTH = 2000

/** One to three dotted numbers — what the stores actually accept. */
const VERSION_PATTERN = /^\d+(\.\d+){0,2}$/

const SEGMENTS = 3

function versionKey(version: string): number[] {
  const parts = version.split('.').map((part) => Number(part))
  while (parts.length < SEGMENTS) parts.push(0)
  return parts
}

/**
 * -1 / 0 / 1, compared segment by segment as numbers. Comparing as text is
 * wrong the moment a segment reaches double digits: '1.0.10' < '1.0.9'.
 * Both arguments must already match VERSION_PATTERN.
 */
export function compareReleaseVersions(a: string, b: string): number {
  const left = versionKey(a)
  const right = versionKey(b)
  for (let i = 0; i < SEGMENTS; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1
  }
  return 0
}

const version = z
  .string()
  .trim()
  .regex(VERSION_PATTERN, 'Use a version like 1.0.9')

const appReleaseInputSchema = z
  .object({
    platform: z.enum(APP_RELEASE_PLATFORMS),
    latestVersion: version,
    minimumVersion: version,
    storeUrl: z
      .string()
      .trim()
      .url('Enter the full store link')
      .startsWith('https://', 'The store link must be https'),
    // An empty box means "no notes" rather than an empty paragraph under the
    // prompt.
    releaseNotes: z
      .string()
      .trim()
      .max(MAX_RELEASE_NOTES_LENGTH)
      .nullable()
      .transform((value) => (value === null || value === '' ? null : value)),
  })
  .refine(
    (value) => compareReleaseVersions(value.minimumVersion, value.latestVersion) <= 0,
    {
      message: 'The minimum supported version cannot be newer than the latest release',
      path: ['minimumVersion'],
    }
  )

export type AppReleaseInput = z.infer<typeof appReleaseInputSchema>

export type ParseResult<T> = ({ ok: true } & T) | { ok: false; error: string }

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid release'
  const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
  return `${path}${issue.message}`
}

export function parseAppReleaseInput(input: unknown): ParseResult<{ input: AppReleaseInput }> {
  const parsed = appReleaseInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return { ok: true, input: parsed.data }
}
