import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { TenantFormWrapper } from '@/components/superadmin/tenant-form-wrapper'

// Force dynamic rendering to avoid Cloudinary prerendering issues
export const dynamic = 'force-dynamic'

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ lead_id?: string; name?: string; email?: string }>
}) {
  const params = await searchParams
  const prefill = params.lead_id
    ? { leadId: params.lead_id, name: params.name || '', email: params.email || '' }
    : undefined

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

      <TenantFormWrapper prefill={prefill} />
    </div>
  )
}

