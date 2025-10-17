import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug } from '@/lib/admin-service'
import { Badge } from '@/components/ui/badge'
import type { Tenant } from '@/types/database'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  
  const tenantData = await getTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData

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

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Your brand colors and styling</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded border"
              style={{ backgroundColor: tenant.primary_color }}
            />
            <div>
              <p className="text-sm font-medium">Primary Color</p>
              <p className="text-sm text-muted-foreground">{tenant.primary_color}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded border"
              style={{ backgroundColor: tenant.secondary_color }}
            />
            <div>
              <p className="text-sm font-medium">Secondary Color</p>
              <p className="text-sm text-muted-foreground">{tenant.secondary_color}</p>
            </div>
          </div>
          {tenant.accent_color && (
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded border"
                style={{ backgroundColor: tenant.accent_color }}
              />
              <div>
                <p className="text-sm font-medium">Accent Color</p>
                <p className="text-sm text-muted-foreground">{tenant.accent_color}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messenger Integration</CardTitle>
          <CardDescription>Facebook Messenger integration details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Page ID</p>
            <p className="text-sm text-muted-foreground">{tenant.messenger_page_id}</p>
          </div>
          {tenant.messenger_username && (
            <div>
              <p className="text-sm font-medium">Username</p>
              <p className="text-sm text-muted-foreground">@{tenant.messenger_username}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your account preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Contact the platform administrator to update your restaurant settings or branding.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

