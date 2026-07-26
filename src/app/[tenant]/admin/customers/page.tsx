import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { Button } from '@/components/ui/button'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getCustomersPage } from '@/lib/customers-service'
import { CustomersList } from '@/components/admin/customers-list'
import { CustomersSkeleton } from '@/components/admin/customers-skeleton'
import type { Tenant } from '@/types/database'

interface CustomersPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ page?: string }>
}

async function CustomersContent({
  tenantId,
  tenantSlug,
  page,
}: {
  tenantId: string
  tenantSlug: string
  page: number
}) {
  // A failed read must NOT render as "no customers yet" — that made a broken
  // permission or query indistinguishable from a genuinely empty list.
  let result: Awaited<ReturnType<typeof getCustomersPage>>
  try {
    result = await getCustomersPage(tenantId, { page })
  } catch (error) {
    console.error('[customers] failed to load customers page', error)
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
        <p className="font-medium">We couldn&apos;t load your customers.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This is a problem on our side, not missing data. Please refresh — if it keeps
          happening, contact support.
        </p>
      </div>
    )
  }

  const { customers, pagination } = result

  const basePath = `/${tenantSlug}/admin/customers`

  return (
    <>
      <CustomersList customers={customers} tenantSlug={tenantSlug} />

      {pagination.totalPages > 1 && (
        <nav
          className="flex items-center justify-between border-t pt-4"
          aria-label="Customers pagination"
        >
          <p className="text-sm text-muted-foreground">
            Showing {pagination.rangeStart}–{pagination.rangeEnd} of {pagination.totalCount}
          </p>
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={!pagination.hasPreviousPage}
              className={!pagination.hasPreviousPage ? 'pointer-events-none opacity-50' : ''}
            >
              <Link href={`${basePath}?page=${pagination.currentPage - 1}`} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" /> Previous
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage}
              className={!pagination.hasNextPage ? 'pointer-events-none opacity-50' : ''}
            >
              <Link href={`${basePath}?page=${pagination.currentPage + 1}`} aria-label="Next page">
                Next <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </nav>
      )}
    </>
  )
}

export default async function CustomersPage({ params, searchParams }: CustomersPageProps) {
  const { tenant: tenantSlug } = await params
  const { page: pageParam } = await searchParams

  const tenantData = await getCachedTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData
  const page = parseInt(pageParam ?? '1', 10)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Customers' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Customers</h1>
        <p className="text-muted-foreground">
          Your regulars, captured automatically from orders.
        </p>
      </div>

      <Suspense fallback={<CustomersSkeleton />}>
        <CustomersContent tenantId={tenant.id} tenantSlug={tenantSlug} page={page} />
      </Suspense>
    </div>
  )
}
