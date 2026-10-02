import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SettingsOverview } from '@/components/admin/settings/settings-overview'
import { loadSettingsContext } from '@/lib/settings/load-settings-context'

export const metadata = {
  title: 'Settings',
}

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const context = await loadSettingsContext(tenantSlug)

  if (!context) {
    return <div>Tenant not found</div>
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: `/${tenantSlug}/admin` }, { label: 'Settings' }]} />
      <SettingsOverview
        storeName={context.tenant.name}
        catalog={context.catalog}
        tenant={context.tenant}
        accountEmail={context.accountEmail}
      />
    </div>
  )
}
