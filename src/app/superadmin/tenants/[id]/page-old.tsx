'use client'

import { useParams } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { TenantForm } from '@/components/superadmin/tenant-form'
import { useTenant } from '@/lib/queries/tenants'

export default function EditTenantPage() {
  const params = useParams()
  const tenantId = params.id as string
  const { data: tenant, isLoading: loading } = useTenant(tenantId)

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: '/superadmin' },
            { label: 'Tenants', href: '/superadmin/tenants' },
            { label: 'Edit Tenant' },
          ]}
        />
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: '/superadmin' },
            { label: 'Tenants', href: '/superadmin/tenants' },
            { label: 'Edit Tenant' },
          ]}
        />
        <div className="text-center">
          <h1 className="text-2xl font-bold">Tenant not found</h1>
          <p className="text-muted-foreground">The tenant you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Tenants', href: '/superadmin/tenants' },
          { label: 'Edit Tenant' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Edit Tenant</h1>
        <p className="text-muted-foreground">Update the details of {tenant.name}</p>
      </div>

      <TenantForm tenant={tenant} />
    </div>
  )
}

