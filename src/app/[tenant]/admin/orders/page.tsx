import { Suspense } from 'react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedCurrentUserRole, getCachedTenantBySlug } from '@/lib/cache'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { resolveOrderBackend } from '@/lib/order-backend'
import { ConvexOrdersWrapper } from '@/components/admin/convex-orders-wrapper'
import { OrdersSkeleton } from '@/components/admin/orders-skeleton'
import { PlatformOrdersView } from '@/components/admin/orders-table/platform-orders-view'
import { parseOrdersTableFilters, type OrdersTableFilters } from '@/lib/admin/orders-table/filters'
import { readOrdersTable } from '@/lib/admin/orders-table/read-orders-table'

interface OrdersPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Platform stores: every filter in the address is applied in the query, so
 * the page, its total and the tab counts describe the same orders.
 */
async function PlatformOrders({ tenantSlug, tenantId, filters }: { tenantSlug: string; tenantId: string; filters: OrdersTableFilters }) {
  const [data, role] = await Promise.all([readOrdersTable(tenantId, filters), getCachedCurrentUserRole()])
  // Resolved on the server from the request-cached admin row, so the browser is
  // never trusted to say which branch it may hear about.
  const scope = resolveBranchScope(role ?? { role: '' })
  return <PlatformOrdersView data={data} filters={filters} tenantSlug={tenantSlug} tenantId={tenantId} scope={scope} />
}

export default async function OrdersPage({ params, searchParams }: OrdersPageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  // A tenant marked `convex` without a deployment URL has nothing to render, so
  // it falls back to the platform queue exactly as it did before.
  const showConvex = resolveOrderBackend(tenant) === 'convex' && Boolean(tenant.convex_deployment_url)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-24">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Orders' },
        ]}
      />

      <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.02em] text-wn-ink md:text-[30px]">Orders</h1>

      {showConvex ? (
        <ConvexOrdersWrapper
          convexUrl={tenant.convex_deployment_url!}
          tenantId={tenant.id}
          // The Convex tab is a client component and must not decide which branch it may read.
          scope={resolveBranchScope((await getCachedCurrentUserRole()) ?? { role: '' })}
          lalamoveEnabled={tenant.lalamove_enabled === true}
        />
      ) : (
        <Suspense fallback={<OrdersSkeleton />}>
          <PlatformOrders tenantSlug={tenantSlug} tenantId={tenant.id} filters={parseOrdersTableFilters(await searchParams)} />
        </Suspense>
      )}
    </div>
  )
}
