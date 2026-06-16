import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { PageHeader, EmptyState } from '@/components/superadmin/ui/primitives'
import { getTenants } from '@/lib/queries/tenants-server'
import {
  getTenantsOverview,
  getTenantMetrics,
} from '@/lib/queries/tenant-metrics-server'
import { TenantOverview } from '@/components/superadmin/tenant-overview'
import { TenantManager } from '@/components/superadmin/tenant-manager'

// Cache the tenant list for 60s; mutations already revalidate
export const revalidate = 60

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
        >
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
            <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
          </div>
          <div className="mt-4 h-8 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
        </div>
      ))}
    </div>
  )
}

function TenantListSkeleton() {
  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="h-11 w-full max-w-sm animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="flex items-center gap-2">
          <div className="h-10 w-44 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-10 w-40 animate-pulse rounded-xl bg-white/[0.06]" />
          <div className="h-10 w-24 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
      </div>
      <div className="h-5 w-28 animate-pulse rounded-lg bg-white/[0.06]" />

      {/* Dense list */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <div className="divide-y divide-white/[0.06]">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-4 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-10 w-10 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded-lg bg-white/[0.06]" />
                <div className="h-3 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
              </div>
              <div className="hidden h-8 w-32 animate-pulse rounded-lg bg-white/[0.06] md:block" />
              <div className="hidden h-6 w-40 animate-pulse rounded-full bg-white/[0.06] lg:block" />
              <div className="hidden h-6 w-16 animate-pulse rounded-full bg-white/[0.06] sm:block" />
              <div className="h-8 w-16 animate-pulse rounded-lg bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

async function OverviewSection() {
  const overview = await getTenantsOverview()
  return <TenantOverview overview={overview} />
}

async function TenantList() {
  const { data: tenants, count } = await getTenants()

  if (count === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
        <EmptyState
          icon={Store}
          title="No restaurants yet"
          description="Get started by adding your first restaurant tenant."
          action={
            <Link href="/superadmin/tenants/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Restaurant
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  const metrics = await getTenantMetrics(tenants.map((t) => t.id))

  return (
    <TenantManager
      initialTenants={tenants}
      initialCount={count}
      initialMetrics={metrics}
    />
  )
}

export default function TenantsPage() {
  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Restaurants' },
        ]}
      />

      <PageHeader
        eyebrow="Platform"
        title="Restaurants"
        subtitle="Manage every restaurant tenant on the platform."
        actions={
          <Link href="/superadmin/tenants/new">
            <Button className="bg-white text-black hover:bg-white/90">
              <Plus className="mr-2 h-4 w-4" />
              Add Restaurant
            </Button>
          </Link>
        }
      />

      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewSection />
      </Suspense>

      <Suspense fallback={<TenantListSkeleton />}>
        <TenantList />
      </Suspense>
    </div>
  )
}
