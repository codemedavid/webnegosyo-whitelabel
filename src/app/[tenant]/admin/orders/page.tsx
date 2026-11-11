import { Suspense } from 'react'
import { Info } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getOrdersByTenant } from '@/lib/orders-service'
import { RealtimeOrdersWrapper } from '@/components/admin/realtime-orders-wrapper'
import { getCachedCurrentUserRole } from '@/lib/cache'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { ConvexOrdersWrapper } from '@/components/admin/convex-orders-wrapper'
import { OrdersSkeleton } from '@/components/admin/orders-skeleton'
import { resolveOrderBackend } from '@/lib/order-backend'
import type { Tenant } from '@/types/database'
import type { PaginatedOrdersResult } from '@/lib/orders-service'

interface OrdersPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ 
    page?: string
    status?: string
    orderType?: string
  }>
}

async function OrdersContent({
  tenantSlug,
  tenantId,
  page,
  status,
  orderType
}: {
  tenantSlug: string
  tenantId: string
  page: number
  status?: string
  orderType?: string
}) {
  const result = await getOrdersByTenant(tenantId, {
    page,
    limit: 20,
    status,
    orderType,
  })

  const paginatedResult = result as PaginatedOrdersResult
  const scope = resolveBranchScope((await getCachedCurrentUserRole()) ?? { role: '' })

  return (
    <RealtimeOrdersWrapper
      initialOrders={paginatedResult.orders}
      tenantSlug={tenantSlug}
      tenantId={tenantId}
      scope={scope}
      pagination={{
        currentPage: paginatedResult.currentPage,
        totalPages: paginatedResult.totalPages,
        totalCount: paginatedResult.totalCount,
        hasNextPage: paginatedResult.hasNextPage,
        hasPreviousPage: paginatedResult.hasPreviousPage,
      }}
    />
  )
}

export default async function OrdersPage({ params, searchParams }: OrdersPageProps) {
  const { tenant: tenantSlug } = await params
  const searchParamsData = await searchParams
  
  const tenantData = await getCachedTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData
  const page = parseInt(searchParamsData.page || '1', 10)
  const status = searchParamsData.status
  const orderType = searchParamsData.orderType
  const backend = resolveOrderBackend(tenant)
  // A tenant marked `convex` without a deployment URL has nothing to render, so
  // it keeps falling back to the platform queue exactly as it did before.
  const showConvex = backend === 'convex' && Boolean(tenant.convex_deployment_url)
  // Resolved server-side; the Convex tab is a client component and must not be
  // trusted to decide which branch it may read.
  const convexScope = resolveBranchScope((await getCachedCurrentUserRole()) ?? { role: '' })

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Orders' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground">Manage customer orders</p>
      </div>

      {showConvex && (
        <ConvexOrdersWrapper
          convexUrl={tenant.convex_deployment_url!}
          tenantId={tenant.id}
          scope={convexScope}
          lalamoveEnabled={tenant.lalamove_enabled === true}
        />
      )}

      {!showConvex && (
        <>
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Limited Mode</p>
              <p className="text-blue-700">Real-time order management with analytics requires Convex setup. Contact support to enable full features.</p>
            </div>
          </div>

          <Suspense fallback={<OrdersSkeleton />}>
            <OrdersContent
              tenantSlug={tenantSlug}
              tenantId={tenant.id}
              page={page}
              status={status}
              orderType={orderType}
            />
          </Suspense>
        </>
      )}
    </div>
  )
}
