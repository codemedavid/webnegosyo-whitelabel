import { FooterManagerCard } from '@/components/admin/footer/footer-manager-card'
import { SettingsSection } from '@/components/admin/settings/settings-section'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'

export default async function FooterSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant } = await requireSettingsSection(tenantSlug, 'footer')

  return (
    <SettingsSection tenantSlug={tenantSlug} section="footer">
      <FooterManagerCard tenant={tenant} />
    </SettingsSection>
  )
}
