import { OperatingHoursCard } from '@/components/admin/operating-hours-card'
import { SettingsSection } from '@/components/admin/settings/settings-section'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'

export default async function HoursSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant } = await requireSettingsSection(tenantSlug, 'hours')

  return (
    <SettingsSection tenantSlug={tenantSlug} section="hours">
      {/* Drives advance-order scheduling slots, and closing the shop when enforced */}
      <OperatingHoursCard
        tenantId={tenant.id}
        initialHours={tenant.operating_hours ?? null}
        initialTimezone={tenant.timezone ?? null}
        initialEnforce={tenant.enforce_operating_hours === true}
      />
    </SettingsSection>
  )
}
