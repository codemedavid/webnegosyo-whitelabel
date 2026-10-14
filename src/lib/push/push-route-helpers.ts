/**
 * Server-side helpers shared by the pg_net-called push routes
 * (`/api/push/notify-order`, `/api/push/notify-merchant`).
 */
import { after } from 'next/server'
import type { createAdminClient } from '@/lib/supabase/admin'
import { staleTokensFrom, type PushFailure } from './expo-delivery'

type AdminClient = ReturnType<typeof createAdminClient>

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
