import { z } from 'zod'
import { httpsUrlSchema } from './primitives'

const semverSchema = z.string().regex(/^\d+\.\d+\.\d+$/)

/** The platform's release policy for one store's build on one platform. */
export const appReleaseSchema = z.object({
  /** Below this the app must update before it can be used; null = no floor. */
  minimumVersion: semverSchema.nullable(),
  latestVersion: semverSchema.nullable(),
  storeUrl: httpsUrlSchema.nullable(),
})

export type AppRelease = z.infer<typeof appReleaseSchema>

/**
 * `GET /api/app/v1/resolve`: which store this build is (from its native
 * application id, never the JS manifest an OTA update replaces) and its
 * release gate per platform.
 */
export const appResolveSchema = z.object({
  tenantId: z.string().min(1),
  slug: z.string().min(1),
  status: z.enum(['draft', 'live', 'paused']),
  ios: appReleaseSchema,
  android: appReleaseSchema,
})

export type AppResolve = z.infer<typeof appResolveSchema>
