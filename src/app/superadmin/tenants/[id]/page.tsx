import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { TenantFormWrapper } from '@/components/superadmin/tenant-form-wrapper'
import { TenantUsersList } from '@/components/superadmin/tenant-users-list'
import { getTenant } from '@/lib/queries/tenants-server'
import { getTenantUsers } from '@/actions/users'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

// Force dynamic rendering to avoid Cloudinary prerendering issues
export const dynamic = 'force-dynamic'

async function TenantData({ id }: { id: string }) {
  const tenant = await getTenant(id)

  if (!tenant) {
    notFound()
  }

  // Fetch users for this tenant
  const users = await getTenantUsers(id)

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold">Edit Tenant</h1>
        <p className="text-muted-foreground">Update the details of {tenant.name}</p>
      </div>

      {/* User Management Section */}
      <TenantUsersList 
        tenantId={tenant.id} 
        tenantName={tenant.name}
        users={users}
      />

      {/* Tenant Form Section */}
      <TenantFormWrapper tenant={tenant} />
    </>
  )
}

export default function EditTenantPage({
  params,
}: {
  params: { id: string }
}) {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Tenants', href: '/superadmin/tenants' },
          { label: 'Edit Tenant' },
        ]}
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <div>
              <div className="h-9 w-48 animate-pulse bg-muted rounded mb-2" />
              <div className="h-5 w-64 animate-pulse bg-muted rounded" />
            </div>
            {/* User Management Loading Skeleton */}
            <Card>
              <CardHeader>
                <div className="h-6 w-32 animate-pulse bg-muted rounded" />
              </CardHeader>
              <CardContent>
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="mb-3 h-16 w-full animate-pulse bg-muted rounded" />
                ))}
              </CardContent>
            </Card>
            {/* Tenant Form Loading Skeleton */}
            <Card>
              <CardHeader>
                <div className="h-6 w-40 animate-pulse bg-muted rounded" />
              </CardHeader>
              <CardContent className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-24 animate-pulse bg-muted rounded" />
                    <div className="h-10 w-full animate-pulse bg-muted rounded" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        }
      >
        <TenantData id={params.id} />
      </Suspense>
    </div>
  )
}

