import { DeleteOrdersCard } from '@/components/admin/order-deletion/delete-orders-card'
import { SettingsSection } from '@/components/admin/settings/settings-section'
import { resolveOrderBackend } from '@/lib/order-backend'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'

export default async function DataSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant } = await requireSettingsSection(tenantSlug, 'data')

  return (
    <SettingsSection tenantSlug={tenantSlug} section="data">
      <DeleteOrdersCard tenantSlug={tenantSlug} isAvailable={resolveOrderBackend(tenant) === 'platform'} />
    </SettingsSection>
  )
}
