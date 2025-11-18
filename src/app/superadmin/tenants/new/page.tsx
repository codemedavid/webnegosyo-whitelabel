import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { TenantFormWrapper } from '@/components/superadmin/tenant-form-wrapper'

// Force dynamic rendering to avoid Cloudinary prerendering issues
export const dynamic = 'force-dynamic'

export default function NewTenantPage() {
  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
  }

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

      <TenantFormWrapper />
    </div>
  )
}

