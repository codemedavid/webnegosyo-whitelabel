import { AccountSettingsCard } from '@/components/admin/account-settings-card'
import { SettingsSection } from '@/components/admin/settings/settings-section'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'

export default async function AccountSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { accountEmail } = await requireSettingsSection(tenantSlug, 'account')

  return (
    <SettingsSection tenantSlug={tenantSlug} section="account">
      {/* Every admin manages their own credentials */}
      <AccountSettingsCard currentEmail={accountEmail ?? ''} />
    </SettingsSection>
  )
}
