import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { QrCodesStudio } from '@/components/admin/qr-codes/qr-codes-studio'
import { getCachedTenantBySlug } from '@/lib/cache'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { listStoreAddresses } from '@/lib/qr-print/qr-links'
import type { QrOutlet, QrTable } from '@/lib/qr-print/qr-items'
import { createClient } from '@/lib/supabase/server'
import { getRootDomain } from '@/lib/tenant-host'

/** A floor plan, not a warehouse — and well under the 1000-row API cap. */
const MAX_TABLES = 1000

interface TableRow {
  id: string
  label: string
  outlet_id: string | null
  zone: string | null
}

/**
 * The floor plan's live tables. Read as the signed-in user: RLS
 * (`app_user_may_reach_branch`) already narrows a branch manager to their
 * own floor. Null when the read failed, so the page can say so rather than
 * show an empty floor.
 */
async function loadTables(tenantId: string): Promise<QrTable[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('dining_tables')
    .select('id, label, outlet_id, zone')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(MAX_TABLES)

  if (error) {
    console.error('[qr-codes] dining_tables read failed', { tenantId, error: error.message })
    return null
  }
  return ((data ?? []) as TableRow[]).map((row) => ({
    id: row.id,
    label: row.label,
    outletId: row.outlet_id,
    zone: row.zone,
  }))
}

async function loadOutlets(tenantId: string): Promise<QrOutlet[]> {
  try {
    const outlets = await createSupabaseOutletRepository().listByTenant(tenantId)
    return outlets.map((outlet) => ({ id: outlet.id, name: outlet.name, slug: outlet.slug, isActive: outlet.is_active }))
  } catch (error) {
    console.error('[qr-codes] outlets read failed', { tenantId, error })
    return []
  }
}

/**
 * QR Codes — printable codes for the store, each branch and each table, with
 * the store's logo in the middle. Everything is drawn in the browser; this
 * page only reads what the codes should point at.
 */
export default async function QrCodesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) {
    return <div>Tenant not found</div>
  }

  const isMultiBranch = isMultiBranchEnabled(tenant)
  const [outlets, tables] = await Promise.all([
    isMultiBranch ? loadOutlets(tenant.id) : Promise.resolve([]),
    loadTables(tenant.id),
  ])

  const addresses = listStoreAddresses({
    slug: tenant.slug,
    domain: tenant.domain ?? null,
    rootDomain: getRootDomain(),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null,
  })

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: `/${tenantSlug}/admin` }, { label: 'QR Codes' }]} />

      <div>
        <h1 className="text-3xl font-bold">QR Codes</h1>
        <p className="text-muted-foreground">
          Print a code for your store, each branch and every table. Guests scan it to open your menu — a table&apos;s
          code fills in the table number for them at checkout.
        </p>
      </div>

      <QrCodesStudio
        storeName={tenant.name}
        tenantSlug={tenant.slug}
        logoUrl={tenant.logo_url || null}
        accentColor={tenant.primary_color ?? null}
        addresses={addresses}
        isMultiBranch={isMultiBranch}
        outlets={outlets}
        tables={tables ?? []}
        didTablesFail={tables === null}
      />
    </div>
  )
}
