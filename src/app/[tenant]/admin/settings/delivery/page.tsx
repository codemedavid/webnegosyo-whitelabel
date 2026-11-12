import { DeliverySettingsForm } from '@/components/admin/delivery-settings-form'
import { LalamoveSettingsCard } from '@/components/admin/lalamove-settings-card'
import { PickupScanCard } from '@/components/admin/pickup-scan-card'
import { SettingsSection } from '@/components/admin/settings/settings-section'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'
import { hasStoredLalamoveKeys } from '@/lib/tenants-service'

export default async function DeliverySettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant, viewer } = await requireSettingsSection(tenantSlug, 'delivery')

  // Lalamove is the owner's to configure, and only when the platform switched it on.
  const showLalamove = viewer.isOwner && tenant.lalamove_enabled === true
  // Only a "has keys" boolean ever reaches the page; the keys stay server-side.
  const hasLalamoveKeys = showLalamove ? (await hasStoredLalamoveKeys(tenant.id)) === true : false

  return (
    <SettingsSection tenantSlug={tenantSlug} section="delivery">
      <DeliverySettingsForm
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        mapboxEnabled={tenant.mapbox_enabled ?? true}
        lalamoveEnabled={tenant.lalamove_enabled ?? false}
        initial={{
          distance_delivery_enabled: tenant.distance_delivery_enabled ?? false,
          delivery_price_per_km: tenant.delivery_price_per_km ?? null,
          delivery_min_fee: tenant.delivery_min_fee ?? null,
          delivery_radius_km: tenant.delivery_radius_km ?? null,
          free_delivery_min_order: tenant.free_delivery_min_order ?? null,
          restaurant_address: tenant.restaurant_address ?? '',
          restaurant_latitude: tenant.restaurant_latitude ?? null,
          restaurant_longitude: tenant.restaurant_longitude ?? null,
        }}
      />

      {showLalamove && (
        <LalamoveSettingsCard
          tenantId={tenant.id}
          tenantSlug={tenantSlug}
          hasExistingKeys={hasLalamoveKeys}
          senderPhone={tenant.lalamove_sender_phone ?? ''}
          fallbackPhone={tenant.footer_phone || tenant.footer_whatsapp || ''}
          pickupAddress={tenant.restaurant_address ?? ''}
          // Lalamove quotes from coordinates, not from the address text, so a
          // typed address with no pin is still an unbookable store.
          hasPickupCoordinates={tenant.restaurant_latitude != null && tenant.restaurant_longitude != null}
        />
      )}

      {/* Scan-to-collect pickup */}
      <PickupScanCard tenantId={tenant.id} initialEnabled={tenant.pickup_scan_enabled !== false} />
    </SettingsSection>
  )
}
