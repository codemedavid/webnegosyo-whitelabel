import { SettingsSection } from '@/components/admin/settings/settings-section'
import { SmsSettingsCard } from '@/components/admin/settings/sms-settings-card'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'

/** Settings → Text messages: the store's Semaphore account (the merchant app has the same card). */
export default async function SmsSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant, viewer } = await requireSettingsSection(tenantSlug, 'sms')

  return (
    <SettingsSection tenantSlug={tenantSlug} section="sms">
      {/* The route lets only the owner change the key; others see the status. */}
      <SmsSettingsCard tenantId={tenant.id} canChangeKey={viewer.isOwner} />
    </SettingsSection>
  )
}
