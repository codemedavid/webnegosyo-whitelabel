import { FacebookConnectionCard } from '@/components/admin/facebook-connection-card'
import { MessengerModeCard } from '@/components/admin/messenger-mode-card'
import { SettingsSection } from '@/components/admin/settings/settings-section'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'

export default async function MessengerSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant } = await requireSettingsSection(tenantSlug, 'messenger')

  return (
    <SettingsSection tenantSlug={tenantSlug} section="messenger">
      <FacebookConnectionCard tenant={tenant} />

      <MessengerModeCard
        tenantId={tenant.id}
        currentMode={
          tenant.messenger_redirect_mode ||
          // Default to 'direct' when no Facebook page is connected (only username configured)
          // This enables pre-filled message mode by default for simpler setups
          (tenant.facebook_page_id ? 'webhook' : 'direct')
        }
        currentRedirectEnabled={tenant.messenger_redirect_enabled ?? false}
        currentUsername={tenant.messenger_username ?? ''}
      />
    </SettingsSection>
  )
}
