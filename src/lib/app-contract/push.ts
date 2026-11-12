import { z } from 'zod'

/**
 * Order-status push notifications (P7). The app registers its Expo push token
 * for the signed-in session; the server pushes Accepted / Ready / Cancelled
 * (and Delivered for delivery orders) for orders placed from the app.
 */

export const APP_PUSH_PLATFORMS = ['ios', 'android'] as const
export type AppPushPlatform = (typeof APP_PUSH_PLATFORMS)[number]

/** Expo's token format: `ExponentPushToken[…]` (older SDKs: `ExpoPushToken[…]`). */
export const APP_EXPO_PUSH_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/

export const appPushTokenRegistrationSchema = z
  .object({
    token: z.string().regex(APP_EXPO_PUSH_TOKEN_PATTERN),
    platform: z.enum(APP_PUSH_PLATFORMS),
    appVersion: z.string().trim().min(1).max(40).nullable().default(null),
  })
  .strict()
export type AppPushTokenRegistration = z.input<typeof appPushTokenRegistrationSchema>

export const appPushTokenResultSchema = z.object({ registered: z.boolean() })
export type AppPushTokenResult = z.infer<typeof appPushTokenResultSchema>

/** The statuses that send a push (owner, 2026-11-12). Delivered goes to delivery orders only. */
export const APP_PUSHED_STATUSES = ['confirmed', 'ready', 'delivered', 'cancelled'] as const
export type AppPushedStatus = (typeof APP_PUSHED_STATUSES)[number]

/** The Android channel order pushes ride (created by the app before it asks for a token). */
export const APP_ORDER_PUSH_CHANNEL = 'orders'

/** What an order push carries besides its text: enough to open the order, nothing personal. */
export const appOrderPushDataSchema = z.object({
  kind: z.literal('order'),
  orderId: z.string().min(1).max(200),
  status: z.enum(APP_PUSHED_STATUSES),
})
export type AppOrderPushData = z.infer<typeof appOrderPushDataSchema>
