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
  const { customers, pagination } = await getCustomersPage(tenantId, { page }).catch(() => ({
    customers: [],
    pagination: {
      currentPage: 1,
      totalPages: 0,
      offset: 0,
      limit: 50,
      hasPreviousPage: false,
      hasNextPage: false,
      rangeStart: 0,
      rangeEnd: 0,
      totalCount: 0,
    },
  }))

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
