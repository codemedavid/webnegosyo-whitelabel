import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FacebookConnectionCard } from '@/components/admin/facebook-connection-card'
import { MessengerModeCard } from '@/components/admin/messenger-mode-card'
import { FlashScreenCard } from '@/components/admin/flash-screen-card'
import { FooterManagerCard } from '@/components/admin/footer/footer-manager-card'
import { OperatingHoursCard } from '@/components/admin/operating-hours-card'
import { DeliverySettingsForm } from '@/components/admin/delivery-settings-form'
import { StaffManagementCard } from '@/components/admin/staff-management-card'
import { AccountSettingsCard } from '@/components/admin/account-settings-card'
import { LalamoveKeysCard } from '@/components/admin/lalamove-keys-card'
import { canManageStaff, hasPermission } from '@/lib/staff-permissions'
import { listStaffAction } from '@/app/actions/staff'
import type { StaffRecord } from '@/lib/staff-service'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  const userRole = await getCachedCurrentUserRole()
  const caller = userRole ?? { role: 'admin', tenant_id: null }
  const isOwner = canManageStaff(caller)
  const hasSettingsAccess = hasPermission(caller, 'settings')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let staff: StaffRecord[] = []
  if (isOwner) {
    const staffResult = await listStaffAction(tenant.id)
    staff = staffResult.success ? staffResult.data : []
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Settings' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your restaurant settings</p>
      </div>

      {/* Restaurant Information */}
      <Card>
        <CardHeader>
          <CardTitle>Restaurant Information</CardTitle>
          <CardDescription>Your restaurant details are managed by the platform administrator</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Restaurant Name</p>
            <p className="text-sm text-muted-foreground">{tenant.name}</p>
          </div>
          <div>
            <p className="text-sm font-medium">URL Slug</p>
            <p className="text-sm text-muted-foreground">{tenant.slug}</p>
          </div>
          {tenant.domain && (
            <div>
              <p className="text-sm font-medium">Custom Domain</p>
              <p className="text-sm text-muted-foreground">{tenant.domain}</p>
            </div>
          )}
          <div>
            <p className="text-sm font-medium">Status</p>
            <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
              {tenant.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Staff & Permissions — owner only */}
      {isOwner && (
        <StaffManagementCard tenantId={tenant.id} tenantSlug={tenantSlug} staff={staff} />
      )}

      {/* Account — every admin manages their own credentials */}
      <AccountSettingsCard currentEmail={user?.email ?? ''} />

      {/* Lalamove API keys — owner only, when the feature is enabled */}
      {isOwner && tenant.lalamove_enabled && (
        <LalamoveKeysCard
          tenantId={tenant.id}
          tenantSlug={tenantSlug}
          hasExistingKeys={Boolean(tenant.lalamove_api_key && tenant.lalamove_secret_key)}
        />
      )}

      {/* Branding moved to the Branding Studio workspace */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Colors, cards, and storefront appearance now live in the Branding Studio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/${tenantSlug}/admin/branding`}>Open Branding Studio</Link>
          </Button>
        </CardContent>
      </Card>

      {hasSettingsAccess && (
        <>
          {/* Storefront Footer */}
          <FooterManagerCard tenant={tenant} />

          {/* Facebook Messenger Integration */}
          <FacebookConnectionCard tenant={tenant} />

          {/* Messenger Redirect Mode */}
          <MessengerModeCard
            tenantId={tenant.id}
            currentMode={tenant.messenger_redirect_mode || (
              // Default to 'direct' when no Facebook page is connected (only username configured)
              // This enables pre-filled message mode by default for simpler setups
              tenant.facebook_page_id ? 'webhook' : 'direct'
            )}
            currentRedirectEnabled={tenant.messenger_redirect_enabled ?? true}
          />

          {/* Operating Hours (drives advance-order scheduling slots) */}
          <OperatingHoursCard
            tenantId={tenant.id}
            initialHours={tenant.operating_hours ?? null}
            initialTimezone={tenant.timezone ?? null}
            initialEnforce={tenant.enforce_operating_hours === true}
          />

          {/* Distance-Based Delivery Fee */}
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
              restaurant_address: tenant.restaurant_address ?? '',
              restaurant_latitude: tenant.restaurant_latitude ?? null,
              restaurant_longitude: tenant.restaurant_longitude ?? null,
            }}
          />

          {tenant.flash_screen_feature_enabled && (
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
          )}
        </>
      )}
    </div>
  )
}
