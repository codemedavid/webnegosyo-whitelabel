import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { seedDefaultUnits } from '@/lib/inventory/units-service'
import { InventoryManager } from '@/components/admin/inventory-manager'
import { StockAlertsBanner } from '@/components/admin/stock-alerts-banner'
import { getOpenStockAlerts } from '@/lib/inventory/stock-alerts-read'
import { getCachedLastPurchaseDates } from '@/lib/inventory/last-purchase'
import type { Tenant } from '@/types/database'

export default async function AdminInventoryPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const tenantData = await getCachedTenantBySlug(tenantSlug)
  if (!tenantData) {
    return <div>Tenant not found</div>
  }
  const tenant: Tenant = tenantData

  // Inventory is an opt-in feature; keep the route unreachable when disabled so
  // it never appears as a half-configured surface.
  if (!tenant.inventory_enabled) {
    notFound()
  }

  // Seed the default unit catalog on first visit so ingredients always have a
  // unit to reference. Idempotent — existing units are returned untouched.
  // Open alerts need no feature-flag check of their own: when a tenant has
  // low-stock alerts switched off, nothing writes them, so the list is empty
  // and the banner renders nothing.
  const [units, ingredients, alerts, lastPurchaseByItemId] = await Promise.all([
    seedDefaultUnits(tenant.id),
    getIngredients(tenant.id),
    getOpenStockAlerts(tenant.id),
    getCachedLastPurchaseDates(tenant.id),
  ])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', href: `/${tenantSlug}/admin` }, { label: 'Inventory' }]}
      />

      <div>
        <h1 className="text-3xl font-bold">Inventory</h1>
        <p className="text-muted-foreground">
          Track ingredients and their cost per unit. Recipes built from these ingredients power the
          true cost and margin of menu items, variations, and modifier options.
        </p>
      </div>

      <StockAlertsBanner alerts={alerts} />

      <InventoryManager
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        initialIngredients={ingredients}
        initialUnits={units}
        lastPurchaseByItemId={lastPurchaseByItemId}
      />
    </div>
  )
}
