import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { Badge } from '@/components/ui/badge'
import type { Tenant } from '@/types/database'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateTenantBrandingForAdminAction } from '@/actions/tenants'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  
  const tenantData = await getCachedTenantBySlug(tenantSlug)

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
          <CardDescription>Update your brand colors and styling</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData: FormData) => {
              'use server'
              const input = {
                primary_color: String(formData.get('primary_color') || ''),
                secondary_color: String(formData.get('secondary_color') || ''),
                accent_color: String(formData.get('accent_color') || ''),
                background_color: String(formData.get('background_color') || ''),
                header_color: String(formData.get('header_color') || ''),
                header_font_color: String(formData.get('header_font_color') || ''),
                cards_color: String(formData.get('cards_color') || ''),
                cards_border_color: String(formData.get('cards_border_color') || ''),
                card_title_color: String(formData.get('card_title_color') || ''),
                card_price_color: String(formData.get('card_price_color') || ''),
                card_description_color: String(formData.get('card_description_color') || ''),
                button_primary_color: String(formData.get('button_primary_color') || ''),
                button_primary_text_color: String(formData.get('button_primary_text_color') || ''),
                button_secondary_color: String(formData.get('button_secondary_color') || ''),
                button_secondary_text_color: String(formData.get('button_secondary_text_color') || ''),
                text_primary_color: String(formData.get('text_primary_color') || ''),
                text_secondary_color: String(formData.get('text_secondary_color') || ''),
                text_muted_color: String(formData.get('text_muted_color') || ''),
                border_color: String(formData.get('border_color') || ''),
                success_color: String(formData.get('success_color') || ''),
                warning_color: String(formData.get('warning_color') || ''),
                error_color: String(formData.get('error_color') || ''),
                link_color: String(formData.get('link_color') || ''),
                shadow_color: String(formData.get('shadow_color') || ''),
              }
              await updateTenantBrandingForAdminAction(tenant.id, input)
            }}
            className="space-y-8"
          >
            <div className="space-y-8">
              <div>
                <h4 className="text-sm font-medium mb-4">Core</h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="primary_color">Primary</Label>
                    <div className="flex items-center gap-3">
                      <Input id="primary_color" name="primary_color" defaultValue={tenant.primary_color} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.primary_color} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="secondary_color">Secondary</Label>
                    <div className="flex items-center gap-3">
                      <Input id="secondary_color" name="secondary_color" defaultValue={tenant.secondary_color} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.secondary_color} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="accent_color">Accent</Label>
                    <div className="flex items-center gap-3">
                      <Input id="accent_color" name="accent_color" defaultValue={tenant.accent_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.accent_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-4">Layout</h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="background_color">Background</Label>
                    <div className="flex items-center gap-3">
                      <Input id="background_color" name="background_color" defaultValue={tenant.background_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.background_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="header_color">Header</Label>
                    <div className="flex items-center gap-3">
                      <Input id="header_color" name="header_color" defaultValue={tenant.header_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.header_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="header_font_color">Header Font</Label>
                    <div className="flex items-center gap-3">
                      <Input id="header_font_color" name="header_font_color" defaultValue={tenant.header_font_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.header_font_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cards_color">Cards</Label>
                    <div className="flex items-center gap-3">
                      <Input id="cards_color" name="cards_color" defaultValue={tenant.cards_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.cards_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cards_border_color">Cards Border</Label>
                    <div className="flex items-center gap-3">
                      <Input id="cards_border_color" name="cards_border_color" defaultValue={tenant.cards_border_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.cards_border_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="border_color">Border</Label>
                    <div className="flex items-center gap-3">
                      <Input id="border_color" name="border_color" defaultValue={tenant.border_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.border_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-4">Card Text Colors</h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="card_title_color">Card Title</Label>
                    <div className="flex items-center gap-3">
                      <Input id="card_title_color" name="card_title_color" defaultValue={tenant.card_title_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.card_title_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="card_price_color">Card Price</Label>
                    <div className="flex items-center gap-3">
                      <Input id="card_price_color" name="card_price_color" defaultValue={tenant.card_price_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.card_price_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="card_description_color">Card Description</Label>
                    <div className="flex items-center gap-3">
                      <Input id="card_description_color" name="card_description_color" defaultValue={tenant.card_description_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.card_description_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-4">Buttons</h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="button_primary_color">Primary</Label>
                    <div className="flex items-center gap-3">
                      <Input id="button_primary_color" name="button_primary_color" defaultValue={tenant.button_primary_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.button_primary_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="button_primary_text_color">Primary Text</Label>
                    <div className="flex items-center gap-3">
                      <Input id="button_primary_text_color" name="button_primary_text_color" defaultValue={tenant.button_primary_text_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.button_primary_text_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="button_secondary_color">Secondary</Label>
                    <div className="flex items-center gap-3">
                      <Input id="button_secondary_color" name="button_secondary_color" defaultValue={tenant.button_secondary_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.button_secondary_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="button_secondary_text_color">Secondary Text</Label>
                    <div className="flex items-center gap-3">
                      <Input id="button_secondary_text_color" name="button_secondary_text_color" defaultValue={tenant.button_secondary_text_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.button_secondary_text_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-4">Text & States</h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="text_primary_color">Text Primary</Label>
                    <div className="flex items-center gap-3">
                      <Input id="text_primary_color" name="text_primary_color" defaultValue={tenant.text_primary_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.text_primary_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="text_secondary_color">Text Secondary</Label>
                    <div className="flex items-center gap-3">
                      <Input id="text_secondary_color" name="text_secondary_color" defaultValue={tenant.text_secondary_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.text_secondary_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="text_muted_color">Text Muted</Label>
                    <div className="flex items-center gap-3">
                      <Input id="text_muted_color" name="text_muted_color" defaultValue={tenant.text_muted_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.text_muted_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="success_color">Success</Label>
                    <div className="flex items-center gap-3">
                      <Input id="success_color" name="success_color" defaultValue={tenant.success_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.success_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="warning_color">Warning</Label>
                    <div className="flex items-center gap-3">
                      <Input id="warning_color" name="warning_color" defaultValue={tenant.warning_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.warning_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="error_color">Error</Label>
                    <div className="flex items-center gap-3">
                      <Input id="error_color" name="error_color" defaultValue={tenant.error_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.error_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="link_color">Link</Label>
                    <div className="flex items-center gap-3">
                      <Input id="link_color" name="link_color" defaultValue={tenant.link_color || ''} type="color" className="h-9 w-12 p-0 border rounded-md" />
                      <Input value={tenant.link_color || ''} readOnly className="font-mono text-sm" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-4">Shadow</h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <Label htmlFor="shadow_color">Shadow (rgba allowed)</Label>
                    <div className="flex items-center gap-3">
                      <Input id="shadow_color" name="shadow_color" defaultValue={tenant.shadow_color || ''} type="text" className="font-mono text-sm" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-4">
              <Button type="submit">Save Branding</Button>
            </div>
          </form>
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

