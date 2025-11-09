import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug } from '@/lib/admin-service'
import { Badge } from '@/components/ui/badge'
import type { Tenant } from '@/types/database'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateTenantBrandingForAdminAction } from '@/actions/tenants'
import { Separator } from '@/components/ui/separator'
import { ResetButton } from '@/components/admin/reset-button'

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

      {/* Branding Customization */}
      <Card>
        <CardHeader>
          <CardTitle>🎨 Branding Customization</CardTitle>
          <CardDescription>Customize your brand colors, cards, and modal appearance</CardDescription>
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
                modal_background_color: String(formData.get('modal_background_color') || ''),
                modal_title_color: String(formData.get('modal_title_color') || ''),
                modal_price_color: String(formData.get('modal_price_color') || ''),
                modal_description_color: String(formData.get('modal_description_color') || ''),
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
            {/* Core Brand Colors */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Core Brand Colors</h3>
                <p className="text-sm text-muted-foreground">Main colors that define your brand identity</p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ColorPicker 
                  id="primary_color" 
                  label="Primary Color" 
                  value={tenant.primary_color}
                  description="Main brand color"
                />
                <ColorPicker 
                  id="secondary_color" 
                  label="Secondary Color" 
                  value={tenant.secondary_color}
                  description="Secondary brand color"
                />
                <ColorPicker 
                  id="accent_color" 
                  label="Accent Color" 
                  value={tenant.accent_color || ''}
                  description="Highlight color"
                />
              </div>
            </div>

            {/* Layout Colors */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Layout & Background</h3>
                <p className="text-sm text-muted-foreground">Overall page and section backgrounds</p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ColorPicker 
                  id="background_color" 
                  label="Page Background" 
                  value={tenant.background_color || ''}
                  description="Main page background"
                />
                <ColorPicker 
                  id="header_color" 
                  label="Header Background" 
                  value={tenant.header_color || ''}
                  description="Top navigation bar"
                />
                <ColorPicker 
                  id="header_font_color" 
                  label="Header Text" 
                  value={tenant.header_font_color || ''}
                  description="Text in header"
                />
                <ColorPicker 
                  id="border_color" 
                  label="Borders" 
                  value={tenant.border_color || ''}
                  description="General borders"
                />
              </div>
            </div>

            {/* Menu Card Colors */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Menu Cards</h3>
                <p className="text-sm text-muted-foreground">Customize how menu items appear on cards</p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ColorPicker 
                  id="cards_color" 
                  label="Card Background" 
                  value={tenant.cards_color || ''}
                  description="Card background color"
                />
                <ColorPicker 
                  id="cards_border_color" 
                  label="Card Border" 
                  value={tenant.cards_border_color || ''}
                  description="Card outline color"
                />
                <ColorPicker 
                  id="card_title_color" 
                  label="Card Title" 
                  value={tenant.card_title_color || ''}
                  description="Item name on cards"
                />
                <ColorPicker 
                  id="card_price_color" 
                  label="Card Price" 
                  value={tenant.card_price_color || ''}
                  description="Price on cards"
                />
                <ColorPicker 
                  id="card_description_color" 
                  label="Card Description" 
                  value={tenant.card_description_color || ''}
                  description="Description text"
                />
              </div>
            </div>

            {/* Modal/Dialog Colors */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Item Detail Modal</h3>
                <p className="text-sm text-muted-foreground">Customize the popup when viewing item details</p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ColorPicker 
                  id="modal_background_color" 
                  label="Modal Background" 
                  value={tenant.modal_background_color || ''}
                  description="Modal popup background"
                />
                <ColorPicker 
                  id="modal_title_color" 
                  label="Modal Title" 
                  value={tenant.modal_title_color || ''}
                  description="Item name in modal"
                />
                <ColorPicker 
                  id="modal_price_color" 
                  label="Modal Price" 
                  value={tenant.modal_price_color || ''}
                  description="Price in modal"
                />
                <ColorPicker 
                  id="modal_description_color" 
                  label="Modal Description" 
                  value={tenant.modal_description_color || ''}
                  description="Description in modal"
                />
              </div>
            </div>

            {/* Button Colors */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Buttons</h3>
                <p className="text-sm text-muted-foreground">Customize button appearance</p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ColorPicker 
                  id="button_primary_color" 
                  label="Primary Button" 
                  value={tenant.button_primary_color || ''}
                  description="Main action buttons"
                />
                <ColorPicker 
                  id="button_primary_text_color" 
                  label="Primary Button Text" 
                  value={tenant.button_primary_text_color || ''}
                  description="Text on primary buttons"
                />
                <ColorPicker 
                  id="button_secondary_color" 
                  label="Secondary Button" 
                  value={tenant.button_secondary_color || ''}
                  description="Secondary actions"
                />
                <ColorPicker 
                  id="button_secondary_text_color" 
                  label="Secondary Button Text" 
                  value={tenant.button_secondary_text_color || ''}
                  description="Text on secondary buttons"
                />
              </div>
            </div>

            {/* Text Colors */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Text Colors</h3>
                <p className="text-sm text-muted-foreground">General text colors throughout the app</p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ColorPicker 
                  id="text_primary_color" 
                  label="Primary Text" 
                  value={tenant.text_primary_color || ''}
                  description="Main content text"
                />
                <ColorPicker 
                  id="text_secondary_color" 
                  label="Secondary Text" 
                  value={tenant.text_secondary_color || ''}
                  description="Less prominent text"
                />
                <ColorPicker 
                  id="text_muted_color" 
                  label="Muted Text" 
                  value={tenant.text_muted_color || ''}
                  description="Subtle, disabled text"
                />
              </div>
            </div>

            {/* State Colors */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Status & State Colors</h3>
                <p className="text-sm text-muted-foreground">Colors for success, warnings, errors, and links</p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ColorPicker 
                  id="success_color" 
                  label="Success" 
                  value={tenant.success_color || ''}
                  description="Success messages"
                />
                <ColorPicker 
                  id="warning_color" 
                  label="Warning" 
                  value={tenant.warning_color || ''}
                  description="Warning messages"
                />
                <ColorPicker 
                  id="error_color" 
                  label="Error" 
                  value={tenant.error_color || ''}
                  description="Error messages"
                />
                <ColorPicker 
                  id="link_color" 
                  label="Links" 
                  value={tenant.link_color || ''}
                  description="Clickable links"
                />
              </div>
            </div>

            {/* Shadow */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Effects</h3>
                <p className="text-sm text-muted-foreground">Shadow and visual effects</p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <Label htmlFor="shadow_color">Shadow Color (rgba format allowed)</Label>
                  <Input 
                    id="shadow_color" 
                    name="shadow_color" 
                    defaultValue={tenant.shadow_color || ''} 
                    type="text" 
                    className="font-mono text-sm" 
                    placeholder="rgba(0, 0, 0, 0.1)"
                  />
                  <p className="text-xs text-muted-foreground">Example: rgba(0, 0, 0, 0.1)</p>
                </div>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <Button type="submit" size="lg">
                💾 Save All Branding
              </Button>
              <ResetButton />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Messenger Integration */}
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

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your account preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Contact the platform administrator to update your restaurant settings or advanced branding options.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// Reusable ColorPicker component
function ColorPicker({ 
  id, 
  label, 
  value, 
  description 
}: { 
  id: string
  label: string
  value: string
  description?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="font-medium">{label}</Label>
      <div className="flex items-center gap-3">
        <Input 
          id={id} 
          name={id} 
          defaultValue={value} 
          type="color" 
          className="h-11 w-14 p-1 border rounded-md cursor-pointer" 
        />
        <div className="flex-1">
          <Input 
            value={value} 
            readOnly 
            className="font-mono text-sm bg-muted/50" 
          />
        </div>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}
