'use client'

import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { TenantForm } from '@/components/superadmin/tenant-form'

// Force dynamic rendering to avoid Cloudinary prerendering issues
export const dynamic = 'force-dynamic'

export default function NewTenantPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Tenants', href: '/superadmin/tenants' },
          { label: 'New Tenant' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Add Tenant</h1>
        <p className="text-muted-foreground">Create a new restaurant tenant</p>
      </div>

      <TenantForm />
    </div>
  )
}

