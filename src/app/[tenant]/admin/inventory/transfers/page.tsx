import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { getUnits } from '@/lib/inventory/units-service'
import { listTransfers } from '@/lib/inventory/transfers-read'
import { getBranchStockIndex } from '@/lib/inventory/branch-stock-read'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { TransfersWorkbench } from '@/components/admin/transfers-workbench'
import type { Tenant } from '@/types/database'

/**
 * Moving stock between branches.
 *
 * A route of its own rather than a tab on the inventory page. Counting a
 * delivery in happens at a receiving bench on a phone, minutes after a van
 * arrives — a URL that can be opened directly is worth more there than one more
 * tab behind a screen built for a desk.
 *
 * The page renders for a single-shop store too, but the workbench inside it
 * shows nothing, because one branch cannot transfer to itself.
 */
export default async function AdminInventoryTransfersPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const tenantData = await getCachedTenantBySlug(tenantSlug)
  if (!tenantData) return <div>Tenant not found</div>
  const tenant: Tenant = tenantData

  // Inventory is opt-in; keep the route unreachable when it is off so it never
  // appears as a half-configured surface.
  if (!tenant.inventory_enabled) notFound()

  const scope = resolveBranchScope((await getCachedCurrentUserRole()) ?? { role: '' })

  const [transfers, ingredients, units, outlets, stockIndex] = await Promise.all([
    listTransfers(tenant.id),
    getIngredients(tenant.id),
    getUnits(tenant.id),
    createSupabaseOutletRepository().listByTenant(tenant.id),
    // Per-branch, so the form offers what the SOURCE shelf holds. A failed read
    // yields an empty index, which offers nothing rather than offering the
    // roll-up: refusing a legitimate transfer is recoverable, drafting one the
    // ledger will reject at send is the thing this is here to prevent.
    getBranchStockIndex(tenant.id),
  ])

  const unitById = new Map(units.map((unit) => [unit.id, unit.abbreviation]))
  const branches = outlets
    .filter((outlet) => outlet.is_active)
    .map((outlet) => ({ id: outlet.id, name: outlet.name }))

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Inventory', href: `/${tenantSlug}/admin/inventory` },
          { label: 'Transfers' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Transfers</h1>
        <p className="text-muted-foreground">
          Move stock between branches. Nothing leaves a shelf until a transfer is sent, and nothing
          lands on one until the receiving branch counts it in.
        </p>
      </div>

      <TransfersWorkbench
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        transfers={transfers}
        branches={branches}
        ingredients={ingredients.map((item) => ({
          id: item.id,
          name: item.name,
          unit: unitById.get(item.stock_unit_id) ?? '',
        }))}
        stockIndex={stockIndex}
        scope={scope}
      />
    </div>
  )
}
