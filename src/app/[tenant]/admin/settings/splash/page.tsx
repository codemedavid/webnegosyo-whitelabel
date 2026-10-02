import { FlashScreenCard } from '@/components/admin/flash-screen-card'
import { SettingsSection } from '@/components/admin/settings/settings-section'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'

export default async function SplashSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant } = await requireSettingsSection(tenantSlug, 'splash')

  return (
    <SettingsSection tenantSlug={tenantSlug} section="splash">
      <FlashScreenCard
        tenantId={tenant.id}
        initialSettings={{
          isActive: tenant.flash_screen_is_active ?? false,
          title: tenant.flash_screen_title || 'Loading menu...',
          subtitle: tenant.flash_screen_subtitle || '',
          imageUrl: tenant.flash_screen_image_url || '',
          backgroundColor: tenant.flash_screen_background_color || '#111111',
          textColor: tenant.flash_screen_text_color || '#ffffff',
          durationMs: tenant.flash_screen_duration_ms || 2000,
        }}
      />
    </SettingsSection>
  )
}
