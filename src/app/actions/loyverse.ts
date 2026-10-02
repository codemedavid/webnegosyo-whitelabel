'use server'

/**
 * Server actions for the Loyverse POS integration.
 *
 * Console-only (`tenants.edit`): these run with a raw access token from the
 * tenant form, before it is saved to the tenant row, so the credential must
 * never be testable by a caller who could not save that form.
 */

import { revalidatePath } from 'next/cache'
import { getConsoleCaller } from '@/lib/platform-staff/guard'
import { hasPlatformPermission } from '@/lib/platform-staff/permissions'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  testLoyverseConnection,
  type LoyverseConnectionTest,
} from '@/lib/loyverse/client'
import {
  emptyReport,
  importLoyverseCatalog,
  type LoyverseSyncReport,
} from '@/lib/loyverse/catalog-import'
import { loadLoyverseTenant } from '@/lib/loyverse/tenant'
import { ensureLoyverseWebhooks } from '@/lib/loyverse/webhooks'
import { runLoyverseSync } from '@/lib/loyverse/sync-orchestrator'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'

/** The superadmin tenant page's Loyverse controls: tenants.edit. */
async function canEditTenants(): Promise<boolean> {
  const caller = await getConsoleCaller()
  return hasPlatformPermission(caller?.appUser, 'tenants.edit')
}

/**
 * Validates a Loyverse access token and returns the merchant profile plus the
 * store and payment-type lists the tenant form pickers need.
 */
export async function testLoyverseConnectionAction(
  accessToken: string
): Promise<LoyverseConnectionTest> {
  if (!(await canEditTenants())) {
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
/** This request's https origin — only a fallback when no app URL is configured. */
async function requestOrigin(): Promise<string | undefined> {
  const headerList = await headers()
  const host = headerList.get('host')
  const proto = headerList.get('x-forwarded-proto') || 'https'
  return host && proto === 'https' ? `https://${host}` : undefined
}

/**
 * Pulls the tenant's Loyverse catalog into the local menu and rebuilds the
 * item map. Reads the tenant with the service key so the freshly saved token
 * is used even before any cache refresh.
 */
export async function syncLoyverseCatalogAction(tenantId: string): Promise<LoyverseSyncReport> {
  if (!(await canEditTenants())) return emptyReport('Not authorized')

  const admin = createAdminClient()
  const tenant = await loadLoyverseTenant(admin, tenantId).catch(() => null)
  if (!tenant) return emptyReport('Tenant not found')

  // Webhooks are registered BEFORE the import: the import can outrun the
  // function timeout on a big catalog, and registration dying with it is how
  // merchants ended up with zero webhooks and no live sync.
  const report = await runLoyverseSync(tenant, await requestOrigin(), {
    importCatalog: importLoyverseCatalog,
    ensureWebhooks: ensureLoyverseWebhooks,
    recordWebhookStatus: async (id, update) => {
      await admin.from('tenants').update(update as never).eq('id', id)
    },
  })

  if (report.success && tenant.slug) {
    revalidateStorefrontMenu(tenant.slug)
    revalidatePath(`/${tenant.slug}/admin/menu`)
  }
  return report
}
