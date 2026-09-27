import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { InventoryAuditLog } from '@/components/admin/inventory-audit-log'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { getUnits } from '@/lib/inventory/units-service'
import { resolveAuditFilters, summarizeAuditEntries } from '@/lib/inventory/stock-audit'
import { getInventoryAuditLog } from '@/lib/inventory/stock-audit-read'

/**
 * Stock log — every attempt to move stock, including the ones that were
 * refused.
 *
 * The ledger shows what a deduction did; this shows what was ATTEMPTED, from
 * which screen, by whom. A "stock was deducted twice" report is answered here:
 * a second deduction of one order appears as "Second deduction refused", and a
 * manual entry repeated by the same person minutes later is flagged.
 */
export default async function AdminInventoryLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return <div>Tenant not found</div>
  if (!tenant.inventory_enabled) notFound()

  const filters = resolveAuditFilters(await searchParams)
  const [{ entries, loadFailed }, ingredients, units] = await Promise.all([
    getInventoryAuditLog(tenant.id, filters),
    getIngredients(tenant.id),
    getUnits(tenant.id),
  ])

  const unitAbbreviation = new Map(units.map((unit) => [unit.id, unit.abbreviation]))
  const unitByItemId = Object.fromEntries(
    ingredients.map((item) => [item.id, unitAbbreviation.get(item.stock_unit_id) ?? '']),
  )
  const basePath = `/${tenantSlug}/admin/inventory/log`

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Inventory', href: `/${tenantSlug}/admin/inventory` },
          { label: 'Stock log' },
        ]}
      />
      <div>
        <h1 className="text-3xl font-bold">Stock log</h1>
        <p className="text-muted-foreground">
          Every time stock moved — or something tried to move it — with where it came from and who
          did it. A second deduction for the same order is refused and shown here.
        </p>
      </div>
      <InventoryAuditLog
        basePath={basePath}
        entries={entries}
        summary={summarizeAuditEntries(entries)}
        filters={filters}
        unitByItemId={unitByItemId}
        loadFailed={loadFailed}
      />
    </div>
  )
}
