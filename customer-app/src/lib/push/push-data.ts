import { appOrderPushDataSchema } from '@/lib/contract'

/**
 * Where a tapped notification goes. Only an order push the server built
 * (`appOrderPushDataSchema`) opens anything; any other payload opens the app
 * where it was. Pure.
 */
export function routeFromPushData(data: unknown): `/order/${string}` | null {
  const parsed = appOrderPushDataSchema.safeParse(data)
  return parsed.success ? `/order/${encodeURIComponent(parsed.data.orderId)}` : null
}

/** The order a push is about (to refresh it when the push arrives while the app is open). */
export function orderIdFromPushData(data: unknown): string | null {
  const parsed = appOrderPushDataSchema.safeParse(data)
  return parsed.success ? parsed.data.orderId : null
}
