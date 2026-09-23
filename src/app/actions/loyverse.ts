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
import { getTenantSecrets, mergeTenantSecrets } from '@/lib/tenant-secrets'
import {
  testLoyverseConnection,
  type LoyverseConnectionTest,
} from '@/lib/loyverse/client'
import { importLoyverseCatalog, type LoyverseSyncReport } from '@/lib/loyverse/catalog-import'
import type { Tenant } from '@/types/database'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'

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

  // The access token lives in tenant_secrets, not on the row just read.
  const tenantRow: Tenant = mergeTenantSecrets(
    tenant as unknown as Tenant,
    await getTenantSecrets(admin, tenantId)
  )

  // Webhooks are registered BEFORE the import: the import can outrun the
  // function timeout on a big catalog, and registration dying with it is how
  // merchants ended up with zero webhooks and no live sync.
  const { ensureLoyverseWebhooks } = await import('@/lib/loyverse/webhooks')
  const { runLoyverseSync } = await import('@/lib/loyverse/sync-orchestrator')
  const { headers } = await import('next/headers')
  const headerList = await headers()
  const host = headerList.get('host')
  const proto = headerList.get('x-forwarded-proto') || 'https'
  const origin = host && proto === 'https' ? `https://${host}` : undefined

  const report = await runLoyverseSync(tenantRow, origin, {
    importCatalog: importLoyverseCatalog,
    ensureWebhooks: ensureLoyverseWebhooks,
    recordWebhookStatus: async (id, update) => {
      await admin.from('tenants').update(update as never).eq('id', id)
    },
  })

  if (report.success && tenantRow.slug) {
    revalidateStorefrontMenu(tenantRow.slug)
    revalidatePath(`/${tenantRow.slug}/admin/menu`)
  }
  return report
}
