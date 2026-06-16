import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { TenantFormWrapper } from '@/components/superadmin/tenant-form-wrapper'
import { TenantStats } from '@/components/superadmin/tenant-stats'
import { TenantUsersList } from '@/components/superadmin/tenant-users-list'
import { BulkMenuImport } from '@/components/superadmin/bulk-menu-import'
import { getTenant } from '@/lib/queries/tenants-server'
import { getTenantUsers } from '@/actions/users'

// Force dynamic rendering to avoid Cloudinary prerendering issues
export const dynamic = 'force-dynamic'

async function TenantUsersSection({ id, tenantName }: { id: string; tenantName: string }) {
  const users = await getTenantUsers(id)
  return (
    <TenantUsersList
      tenantId={id}
      tenantName={tenantName}
      users={users}
    />
  )
}

function UsersSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-4 h-6 w-32 animate-pulse rounded-xl bg-white/[0.06]" />
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-white/[0.06]" />
        ))}
      </div>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-4 w-24 animate-pulse rounded-full bg-white/[0.06]" />
      ))}
    </div>
  )
}

async function TenantData({ id }: { id: string }) {
  const tenant = await getTenant(id)

  if (!tenant) {
    notFound()
  }

  return (
    <TenantFormWrapper
      tenant={tenant}
      statsSlot={
        <Suspense fallback={<StatsSkeleton />}>
          <TenantStats tenant={tenant} />
        </Suspense>
      }
      usersSlot={
        <Suspense fallback={<UsersSkeleton />}>
          <TenantUsersSection id={tenant.id} tenantName={tenant.name} />
        </Suspense>
      }
      importSlot={<BulkMenuImport tenantId={tenant.id} tenantName={tenant.name} />}
    />
  )
}

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Restaurants', href: '/superadmin/tenants' },
          { label: 'Edit' },
        ]}
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            {/* Sticky header skeleton */}
            <div className="rounded-2xl border border-white/10 bg-[#0a0a0a]/80 px-5 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 animate-pulse rounded-xl bg-white/[0.06]" />
                  <div className="space-y-2">
                    <div className="h-6 w-48 animate-pulse rounded-xl bg-white/[0.06]" />
                    <div className="h-4 w-64 animate-pulse rounded-xl bg-white/[0.06]" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-10 w-28 animate-pulse rounded-xl bg-white/[0.06]" />
                  <div className="h-10 w-28 animate-pulse rounded-xl bg-white/[0.06]" />
                </div>
              </div>
            </div>
            {/* Tab strip skeleton */}
            <div className="flex flex-wrap gap-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
              ))}
            </div>
            {/* Tab body skeleton */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="mb-4 h-6 w-40 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded-xl bg-white/[0.06]" />
                    <div className="h-10 w-full animate-pulse rounded-xl bg-white/[0.06]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <TenantData id={id} />
      </Suspense>
    </div>
  )
}
