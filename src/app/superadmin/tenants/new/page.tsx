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
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Restaurants', href: '/superadmin/tenants' },
          { label: 'New' },
        ]}
      />

      <TenantFormWrapper prefill={prefill} />
    </div>
  )
}
