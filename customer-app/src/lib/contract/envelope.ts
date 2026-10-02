import { z } from 'zod'

/**
 * Every /api/app/v1 response is one of these two shapes. `code` is for the
 * app's logic; `message` is written for a customer and is safe to show.
 */
export const APP_ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'unavailable',
  'internal',
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

export const appErrorSchema = z.object({
  code: z.enum(APP_ERROR_CODES),
  message: z.string().min(1),
})

export type AppError = z.infer<typeof appErrorSchema>

export type AppEnvelope<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: AppError }

export function appEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data, error: z.null() }),
    z.object({ success: z.literal(false), data: z.null(), error: appErrorSchema }),
  ])
}
