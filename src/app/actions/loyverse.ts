'use server'

/**
 * Server actions for the Loyverse POS integration.
 *
 * Superadmin-only: these run with a raw access token from the tenant form,
 * before it is saved to the tenant row, so the credential must never be
 * testable by a non-superadmin caller.
 */

import { createClient } from '@/lib/supabase/server'
import {
  testLoyverseConnection,
  type LoyverseConnectionTest,
} from '@/lib/loyverse/client'

async function isSuperadmin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  return !error && data?.role === 'superadmin'
}

/**
 * Validates a Loyverse access token and returns the merchant profile plus the
 * store and payment-type lists the tenant form pickers need.
 */
export async function testLoyverseConnectionAction(
  accessToken: string
): Promise<LoyverseConnectionTest> {
  if (!(await isSuperadmin())) {
    return { success: false, error: 'Not authorized' }
  }
  const token = accessToken.trim()
  if (!token) {
    return { success: false, error: 'Enter a Loyverse access token first' }
  }
  return testLoyverseConnection(token)
}
