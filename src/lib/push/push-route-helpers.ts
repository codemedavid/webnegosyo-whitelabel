/**
 * Server-side helpers shared by the pg_net-called push routes
 * (`/api/push/notify-order`, `/api/push/notify-merchant`).
 */
import { after } from 'next/server'
import type { createAdminClient } from '@/lib/supabase/admin'
import { staleTokensFrom, type PushFailure } from './expo-delivery'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Per-IP ceiling for these routes. pg_net sends from the database host, so ALL
 * stores' trigger calls share one egress IP, and a refused call is never retried
 * (pg_net fires once). A normal per-IP limit would drop real pushes platform-wide
 * at a busy moment, so this sits far above any real order rate (20 a second across
 * every store) and only stops a flood. Refused before any read or claim, so a
 * refusal never burns an order's push.
 */
export const PG_NET_IP_LIMIT = { limit: 1200, windowSec: 60 }

/**
 * A trigger call whose address could not be read is let through uncounted, as
 * it always was: pg_net fires once, so a refused call is a push that is never
 * sent. The routes a browser or a phone calls count such a request instead.
 */
export const PG_NET_WITHOUT_ADDRESS = { withoutAddress: 'allow' as const }

/**
 * Forgets the devices Expo says no longer have the app, in BOTH token tables:
 * one physical device that has uninstalled is equally dead for order pushes
 * and for platform messages, and a token left behind inflates every
 * "reached N devices" count from then on.
 */
export async function pruneStaleTokens(
  admin: AdminClient,
  failures: readonly PushFailure[],
  logLabel: string,
): Promise<void> {
  const stale = staleTokensFrom(failures)
  if (stale.length === 0) return

  const [orderTokens, deviceTokens] = await Promise.all([
    admin.from('push_tokens').delete().in('token', stale),
    admin.from('platform_device_tokens').delete().in('token', stale),
  ])
  if (orderTokens.error) {
    console.error(`[${logLabel}] stale push_tokens cleanup failed:`, orderTokens.error.message)
  }
  if (deviceTokens.error) {
    console.error(
      `[${logLabel}] stale platform_device_tokens cleanup failed:`,
      deviceTokens.error.message,
    )
  }
}

/**
 * Runs follow-up work once the response is on its way. `after` throws when
 * there is no request scope — a unit test, or any caller outside Next's
 * server runtime — and the work then runs inline rather than being dropped:
 * what it finds is the only signal that a whole platform has gone silent.
 */
export function afterResponse(task: () => Promise<void>): Promise<void> | void {
  try {
    after(task)
  } catch {
    return task()
  }
}
