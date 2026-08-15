'use server'

/**
 * Server actions for the Loyverse POS integration.
 *
 * Superadmin-only: these run with a raw access token from the tenant form,
 * before it is saved to the tenant row, so the credential must never be
 * testable by a non-superadmin caller.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  testLoyverseConnection,
  type LoyverseConnectionTest,
} from '@/lib/loyverse/client'
import { importLoyverseCatalog, type LoyverseSyncReport } from '@/lib/loyverse/catalog-import'
import type { Tenant } from '@/types/database'

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

/**
 * Pulls the tenant's Loyverse catalog into the local menu and rebuilds the
 * item map. Reads the tenant with the service key so the freshly saved token
 * is used even before any cache refresh.
 */
export async function syncLoyverseCatalogAction(tenantId: string): Promise<LoyverseSyncReport> {
  if (!(await isSuperadmin())) {
    return {
      success: false,
      error: 'Not authorized',
      categoriesCreated: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      warnings: [],
    }
  }

  const admin = createAdminClient()
  const { data: tenant, error } = await admin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle()
  if (error || !tenant) {
    return {
      success: false,
      error: 'Tenant not found',
      categoriesCreated: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      warnings: [],
    }
  }

  const tenantRow = tenant as unknown as Tenant
  const report = await importLoyverseCatalog(tenantRow)

  if (report.success && tenantRow.slug) {
    revalidatePath(`/${tenantRow.slug}/menu`)
    revalidatePath(`/${tenantRow.slug}/admin/menu`)
  }
  return report
}
