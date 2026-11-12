import { z } from 'zod'

/**
 * Customer sign-in for one store's app: a PH mobile, a 6-digit text code, an
 * opaque session the app sends as `Authorization: Bearer cs1.…`.
 */

/** Loose on input (the server normalises 09…, 63…, +63…); the server decides validity. */
export const appPhoneInputSchema = z.string().min(1).max(64).regex(/^[+0-9 ()-]+$/)

export const appOtpRequestSchema = z.object({ phone: appPhoneInputSchema }).strict()
export type AppOtpRequest = z.infer<typeof appOtpRequestSchema>

/** Always the same shape, whether or not the number is known to the store. */
export const appOtpRequestResultSchema = z.object({
  challengeId: z.string().uuid(),
  expiresInSeconds: z.number().int().positive(),
})
export type AppOtpRequestResult = z.infer<typeof appOtpRequestResultSchema>

export const appOtpVerifySchema = z
  .object({
    challengeId: z.string().uuid(),
    phone: appPhoneInputSchema,
    code: z.string().regex(/^[0-9]{6}$/),
  })
  .strict()
export type AppOtpVerify = z.infer<typeof appOtpVerifySchema>

export const APP_SESSION_TOKEN_PATTERN = /^cs1\.[A-Za-z0-9_-]{43}$/

export const appProfileSchema = z.object({
  /** null until the customer tells the store what to call them. */
  name: z.string().min(1).max(60).nullable(),
  phoneE164: z.string().regex(/^\+639\d{9}$/),
})
export type AppProfile = z.infer<typeof appProfileSchema>

export const appOtpVerifyResultSchema = z.object({
  token: z.string().regex(APP_SESSION_TOKEN_PATTERN),
  /** First sign-in to this store's app: ask for a name. */
  isNewCustomer: z.boolean(),
  profile: appProfileSchema,
})
export type AppOtpVerifyResult = z.infer<typeof appOtpVerifyResultSchema>

export const appProfilePatchSchema = z
  .object({ name: z.string().trim().min(1).max(60).nullable() })
  .strict()
export type AppProfilePatch = z.infer<typeof appProfilePatchSchema>
