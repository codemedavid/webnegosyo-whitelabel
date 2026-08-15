'use client'

import { useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImageUpload } from '@/components/shared/image-upload'
import { MapboxAddressAutocomplete } from '@/components/shared/mapbox-address-autocomplete'
import { StatusBadge } from '@/components/superadmin/ui/primitives'
import { TenantMonogram } from '@/components/superadmin/tenant-visuals'
import { TenantBrandPreview } from '@/components/superadmin/tenant-brand-preview'
import type { Tenant } from '@/types/database'
import { createTenantAction, updateTenantAction } from '@/actions/tenants'
import { testLoyverseConnectionAction } from '@/app/actions/loyverse'
import type { LoyverseConnectionTest } from '@/lib/loyverse/client'
import { deployConvexToTenantAction } from '@/app/actions/convex'
import { orderBackendPreferenceOf, type SelectableOrderBackend } from '@/lib/order-backend'
import { OrderBackendPicker } from '@/components/superadmin/order-backend-picker'
import { toast } from 'sonner'

interface PrefillData {
  leadId: string
  name: string
  email: string
}

interface TenantFormWrapperProps {
  tenant?: Tenant
  prefill?: PrefillData
  usersSlot?: ReactNode
  importSlot?: ReactNode
  statsSlot?: ReactNode
}

// Common Lalamove vehicle service types. Names are shared across markets; the
// exact availability per city is enforced by Lalamove at quotation time.
const LALAMOVE_SERVICE_TYPES = [
  'MOTORCYCLE',
  'SEDAN',
  'MPV',
  'VAN',
  'TRUCK330',
  'TRUCK550',
] as const

interface TenantFormData {
  name: string
  slug: string
  domain: string
  logo_url: string
  primary_color: string
  secondary_color: string
  accent_color: string
  background_color: string
  header_color: string
  header_font_color: string
  cards_color: string
  cards_border_color: string
  button_primary_color: string
  button_primary_text_color: string
  button_secondary_color: string
  button_secondary_text_color: string
  text_primary_color: string
  text_secondary_color: string
  text_muted_color: string
  border_color: string
  success_color: string
  warning_color: string
  error_color: string
  link_color: string
  shadow_color: string
  messenger_page_id: string
  messenger_username: string
  messenger_redirect_mode: 'webhook' | 'direct'
  is_active: boolean
  mapbox_enabled: boolean
  enable_order_management: boolean
  // Menu engineering
  menu_engineering_enabled: boolean
  checkout_upsell_enabled: boolean
  hide_currency_symbol: boolean
  // Flash screen
  flash_screen_feature_enabled: boolean
  // Bundles
  bundles_enabled: boolean
  inventory_enabled: boolean
  // Multi-branch
  multi_branch_enabled: boolean
  // When the branch is asked for: before the menu (splash) or at checkout.
  outlet_selection_timing: 'before' | 'after'
  // Inventory alerts
  low_stock_alerts_enabled: boolean
  auto_86_enabled: boolean
  // Pairing rules
  pairing_rules_enabled: boolean
  // Unified modifier groups (multi-select with min/max picks)
  modifier_groups_enabled: boolean
  // QR-handoff ordering
  qr_handoff_enabled: boolean
  // Restaurant address for Lalamove pickup
  restaurant_address: string
  restaurant_latitude: string
  restaurant_longitude: string
  // Lalamove configuration
  lalamove_enabled: boolean
  lalamove_api_key: string
  lalamove_secret_key: string
  lalamove_market: string
  lalamove_service_type: string
  lalamove_sandbox: boolean
  lalamove_sender_phone: string
  // Loyverse POS integration
  loyverse_enabled: boolean
  loyverse_access_token: string
  loyverse_store_id: string
  loyverse_payment_type_id: string
  loyverse_push_mode: 'on_create' | 'on_confirm'
  // Distance-based delivery fee (non-Lalamove; Lalamove takes precedence when enabled)
  distance_delivery_enabled: boolean
  delivery_price_per_km: string
  delivery_min_fee: string
  delivery_radius_km: string
  // Convex / Mobile App
  convex_deployment_url: string
  convex_deploy_key: string
  order_backend: SelectableOrderBackend
  // Email notifications
  admin_email: string
  email_notifications_enabled: boolean
}

type SetFormData = Dispatch<SetStateAction<TenantFormData>>

// Memoized color input component to prevent unnecessary re-renders
function ColorInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-20"
          disabled={disabled}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
    </div>
  )
}

// Basic information form section
function BasicInfoSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  const generateSlug = () => {
    const slug = formData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    setFormData({ ...formData, slug })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Restaurant Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Bella Italia"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">URL Slug *</Label>
          <div className="flex gap-2">
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              placeholder="bella-italia"
              required
              disabled={isPending}
            />
            <Button type="button" variant="outline" onClick={generateSlug} disabled={isPending}>
              Generate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Will be accessible at: yoursite.com/{formData.slug}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="domain">Custom Domain (Optional)</Label>
          <Input
            id="domain"
            value={formData.domain}
            onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
            placeholder="bellaitalia.com"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Enter your custom domain (e.g., bellaitalia.com). The system will automatically handle www and non-www variants.
            <br />
            <span className="font-medium">Important:</span> After adding the domain here, you must configure DNS to point to your Vercel deployment.
          </p>
        </div>

        <ImageUpload
          currentImageUrl={formData.logo_url}
          onImageUploaded={(url) => setFormData({ ...formData, logo_url: url })}
          label="Restaurant Logo"
          description="Upload your restaurant logo (recommended: square image)"
          folder="tenants/logos"
          disabled={isPending}
        />

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            className="h-4 w-4 accent-white"
            disabled={isPending}
          />
          <span className="text-sm font-medium text-white">Active</span>
        </label>
      </CardContent>
    </Card>
  )
}

// Branding form section
function BrandingSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <ColorInput
            id="primary_color"
            label="Primary Color"
            value={formData.primary_color}
            onChange={(value) => setFormData({ ...formData, primary_color: value })}
            placeholder="#c41e3a"
            disabled={isPending}
          />
          <ColorInput
            id="secondary_color"
            label="Secondary Color"
            value={formData.secondary_color}
            onChange={(value) => setFormData({ ...formData, secondary_color: value })}
            placeholder="#009246"
            disabled={isPending}
          />
          <ColorInput
            id="accent_color"
            label="Accent Color"
            value={formData.accent_color}
            onChange={(value) => setFormData({ ...formData, accent_color: value })}
            placeholder="#ffd700"
            disabled={isPending}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// Extended branding form section
function ExtendedBrandingSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Extended Branding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorInput
            id="background_color"
            label="Background Color"
            value={formData.background_color}
            onChange={(value) => setFormData({ ...formData, background_color: value })}
            placeholder="#ffffff"
            disabled={isPending}
          />
          <ColorInput
            id="header_color"
            label="Header Color"
            value={formData.header_color}
            onChange={(value) => setFormData({ ...formData, header_color: value })}
            placeholder="#ffffff"
            disabled={isPending}
          />
          <ColorInput
            id="header_font_color"
            label="Header Font Color"
            value={formData.header_font_color}
            onChange={(value) => setFormData({ ...formData, header_font_color: value })}
            placeholder="#000000"
            disabled={isPending}
          />
          <ColorInput
            id="cards_color"
            label="Cards Color"
            value={formData.cards_color}
            onChange={(value) => setFormData({ ...formData, cards_color: value })}
            placeholder="#ffffff"
            disabled={isPending}
          />
          <ColorInput
            id="cards_border_color"
            label="Cards Border Color"
            value={formData.cards_border_color}
            onChange={(value) => setFormData({ ...formData, cards_border_color: value })}
            placeholder="#e5e7eb"
            disabled={isPending}
          />
          <ColorInput
            id="button_primary_color"
            label="Primary Button Color"
            value={formData.button_primary_color}
            onChange={(value) => setFormData({ ...formData, button_primary_color: value })}
            placeholder="#c41e3a"
            disabled={isPending}
          />
          <ColorInput
            id="button_primary_text_color"
            label="Primary Button Text"
            value={formData.button_primary_text_color}
            onChange={(value) => setFormData({ ...formData, button_primary_text_color: value })}
            placeholder="#ffffff"
            disabled={isPending}
          />
          <ColorInput
            id="button_secondary_color"
            label="Secondary Button Color"
            value={formData.button_secondary_color}
            onChange={(value) => setFormData({ ...formData, button_secondary_color: value })}
            placeholder="#f3f4f6"
            disabled={isPending}
          />
          <ColorInput
            id="button_secondary_text_color"
            label="Secondary Button Text"
            value={formData.button_secondary_text_color}
            onChange={(value) => setFormData({ ...formData, button_secondary_text_color: value })}
            placeholder="#111111"
            disabled={isPending}
          />
          <ColorInput
            id="text_primary_color"
            label="Primary Text Color"
            value={formData.text_primary_color}
            onChange={(value) => setFormData({ ...formData, text_primary_color: value })}
            placeholder="#111111"
            disabled={isPending}
          />
          <ColorInput
            id="text_secondary_color"
            label="Secondary Text Color"
            value={formData.text_secondary_color}
            onChange={(value) => setFormData({ ...formData, text_secondary_color: value })}
            placeholder="#6b7280"
            disabled={isPending}
          />
          <ColorInput
            id="text_muted_color"
            label="Muted Text Color"
            value={formData.text_muted_color}
            onChange={(value) => setFormData({ ...formData, text_muted_color: value })}
            placeholder="#9ca3af"
            disabled={isPending}
          />
          <ColorInput
            id="border_color"
            label="Border Color"
            value={formData.border_color}
            onChange={(value) => setFormData({ ...formData, border_color: value })}
            placeholder="#e5e7eb"
            disabled={isPending}
          />
          <ColorInput
            id="success_color"
            label="Success Color"
            value={formData.success_color}
            onChange={(value) => setFormData({ ...formData, success_color: value })}
            placeholder="#10b981"
            disabled={isPending}
          />
          <ColorInput
            id="warning_color"
            label="Warning Color"
            value={formData.warning_color}
            onChange={(value) => setFormData({ ...formData, warning_color: value })}
            placeholder="#f59e0b"
            disabled={isPending}
          />
          <ColorInput
            id="error_color"
            label="Error Color"
            value={formData.error_color}
            onChange={(value) => setFormData({ ...formData, error_color: value })}
            placeholder="#ef4444"
            disabled={isPending}
          />
          <ColorInput
            id="link_color"
            label="Link Color"
            value={formData.link_color}
            onChange={(value) => setFormData({ ...formData, link_color: value })}
            placeholder="#3b82f6"
            disabled={isPending}
          />
          <div className="space-y-2">
            <Label htmlFor="shadow_color">Shadow Color</Label>
            <Input
              id="shadow_color"
              value={formData.shadow_color}
              onChange={(e) => setFormData({ ...formData, shadow_color: e.target.value })}
              placeholder="rgba(0, 0, 0, 0.1)"
              disabled={isPending}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Messenger integration form section
function MessengerSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Messenger Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="messenger_page_id">Facebook Page ID *</Label>
          <Input
            id="messenger_page_id"
            value={formData.messenger_page_id}
            onChange={(e) => setFormData({ ...formData, messenger_page_id: e.target.value })}
            placeholder="123456789"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="messenger_username">Messenger Username</Label>
          <Input
            id="messenger_username"
            value={formData.messenger_username}
            onChange={(e) => setFormData({ ...formData, messenger_username: e.target.value })}
            placeholder="bellaitalia"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Optional: If provided, will use m.me/username instead of page ID
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// Messenger Redirect Mode Section
function MessengerModeSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Messenger Redirect Mode</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="messenger_redirect_mode">Choose how customers are redirected to Messenger:</Label>
          <select
            id="messenger_redirect_mode"
            value={formData.messenger_redirect_mode}
            onChange={(e) => setFormData({
              ...formData,
              messenger_redirect_mode: e.target.value as 'webhook' | 'direct'
            })}
            disabled={isPending}
            className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-white focus:border-white/30 focus:outline-none disabled:opacity-50"
          >
            <option value="webhook">Webhook Mode (Recommended)</option>
            <option value="direct">Direct Mode</option>
          </select>
        </div>

        {formData.messenger_redirect_mode === 'webhook' ? (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-sky-400">Webhook Mode:</strong> Uses m.me links with ref parameter for tracking.
              Orders are automatically sent to the customer&apos;s Messenger via webhook.
              Requires Facebook page connection for best results.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-amber-400">Direct Mode:</strong> Opens Messenger directly (messenger.com/t/).
              Simpler but no webhook tracking - message is pre-filled for customer to send manually.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Mapbox Settings Section
function MapboxSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapbox Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="mapbox_enabled">Enable Mapbox Address Autocomplete</Label>
            <p className="text-sm text-muted-foreground">
              Allow customers to use map picker and address autocomplete for delivery addresses
            </p>
          </div>
          <Switch
            id="mapbox_enabled"
            checked={formData.mapbox_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, mapbox_enabled: checked })}
            disabled={isPending}
          />
        </div>
        {!formData.mapbox_enabled && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-amber-400">Note:</strong> When disabled, customers will need to type their address manually without map assistance.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Order Management Settings Section
function OrderManagementSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Management Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enable_order_management">Enable Order Tracking</Label>
            <p className="text-sm text-muted-foreground">
              Allow orders to be saved to the database and managed in the admin panel
            </p>
          </div>
          <Switch
            id="enable_order_management"
            checked={formData.enable_order_management}
            onCheckedChange={(checked) => setFormData({ ...formData, enable_order_management: checked })}
            disabled={isPending}
          />
        </div>
        {!formData.enable_order_management && (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-sky-400">Note:</strong> When disabled, orders will only redirect to Messenger without being saved to the database.
              Order management features in the admin panel will not be available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Menu Engineering Feature Toggle Section
function MenuEngineeringSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu Engineering</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Enable BCG classification, upsell pairs, badges, and checkout interstitials for this tenant
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="menu_engineering_enabled">Enable Menu Engineering</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, the tenant admin can classify menu items, configure upsell pairs, set item badges, and use checkout interstitial modals
            </p>
          </div>
          <Switch
            id="menu_engineering_enabled"
            checked={formData.menu_engineering_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, menu_engineering_enabled: checked })}
            disabled={isPending}
          />
        </div>
        {!formData.menu_engineering_enabled ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-amber-400">Disabled:</strong> Menu engineering features are off. The tenant admin will not see the Menu Engineering sidebar item, and customers will not see upsell suggestions, badges, or checkout interstitials.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <p className="text-sm text-white/70">
                <strong className="text-emerald-400">Enabled:</strong> The tenant admin can access BCG classification, upsell pair management, and checkout interstitial settings from their admin dashboard.
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="hide_currency_symbol">Hide Currency Symbol</Label>
                <p className="text-sm text-muted-foreground">
                  Remove the peso sign from prices on the menu and product pages (menu psychology technique)
                </p>
              </div>
              <Switch
                id="hide_currency_symbol"
                checked={formData.hide_currency_symbol}
                onCheckedChange={(checked) => setFormData({ ...formData, hide_currency_symbol: checked })}
                disabled={isPending}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Flash screen feature toggle section
function FlashScreenFeatureSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Flash Screen</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Control whether this tenant admin can configure a startup flash screen for customers.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="flash_screen_feature_enabled">Enable Flash Screen Feature</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, tenant admins can manage flash screen content from Admin Settings.
            </p>
          </div>
          <Switch
            id="flash_screen_feature_enabled"
            checked={formData.flash_screen_feature_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, flash_screen_feature_enabled: checked })}
            disabled={isPending}
          />
        </div>
        {!formData.flash_screen_feature_enabled && (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-sky-400">Disabled:</strong> Tenant admins will not see flash screen controls in their settings.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Inventory Feature Toggle Section
function InventoryFeatureSection({
  formData,
  setFormData,
  isPending,
}: {
  formData: TenantFormData
  setFormData: React.Dispatch<React.SetStateAction<TenantFormData>>
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Ingredient stock tracking, recipes and costing — plus optional low-stock warnings and
          automatic 86ing
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="inventory_enabled">Enable Inventory</Label>
            <p className="text-sm text-muted-foreground">
              Master switch. Shows the Inventory section in the tenant admin and the Stock tab in
              the merchant app, and lets orders deplete ingredient stock. Everything below depends
              on it.
            </p>
          </div>
          <Switch
            id="inventory_enabled"
            checked={formData.inventory_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, inventory_enabled: checked })}
            disabled={isPending}
          />
        </div>
        {!formData.inventory_enabled && (
          <p className="text-sm text-muted-foreground">
            Inventory is off — the two settings below have no effect until it is switched on.
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="low_stock_alerts_enabled">Enable Low-Stock Alerts</Label>
            <p className="text-sm text-muted-foreground">
              Raises an alert the moment an ingredient falls to or below its reorder level. Alerts
              are raised once per crossing, not once per sale, and close when stock recovers.
            </p>
          </div>
          <Switch
            id="low_stock_alerts_enabled"
            checked={formData.low_stock_alerts_enabled}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, low_stock_alerts_enabled: checked })
            }
            disabled={isPending}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto_86_enabled">Enable Auto-86</Label>
            <p className="text-sm text-muted-foreground">
              Marks a menu item unavailable when an ingredient its base recipe needs hits zero.
              Items whose optional extras run out are left on the menu. Re-enabling stays manual.
            </p>
          </div>
          <Switch
            id="auto_86_enabled"
            checked={formData.auto_86_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, auto_86_enabled: checked })}
            disabled={isPending}
          />
        </div>
        {formData.auto_86_enabled && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-amber-400">Careful:</strong> this hides dishes from customers
              without asking. Only switch it on for a tenant whose base recipes are complete and
              whose stock counts are kept up to date.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Multi-Branch (Multi-Outlet) Feature Toggle Section
function MultiBranchFeatureSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branches</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          For merchants with more than one physical outlet. Customers pick a branch — before they
          browse or at checkout, the merchant&apos;s choice — and each order records which branch
          fulfills it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="multi_branch_enabled">Enable Branches</Label>
            <p className="text-sm text-muted-foreground">
              Shows the Branches section in the tenant admin. The storefront only changes once the
              merchant has two or more active branches — with zero or one, customers see exactly
              what they see today.
            </p>
          </div>
          <Switch
            id="multi_branch_enabled"
            checked={formData.multi_branch_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, multi_branch_enabled: checked })}
            disabled={isPending}
          />
        </div>

        {formData.multi_branch_enabled && (
          <div className="space-y-2 rounded-lg border p-4">
            <Label htmlFor="outlet_selection_timing">When customers pick a branch</Label>
            <p className="text-sm text-muted-foreground">
              &quot;Before the menu&quot; scopes the whole visit to one branch. &quot;At
              checkout&quot; suits merchants whose menu is identical everywhere and who want
              nothing between the customer and the food.
            </p>
            <Select
              value={formData.outlet_selection_timing}
              onValueChange={(value) =>
                setFormData({ ...formData, outlet_selection_timing: value as 'before' | 'after' })
              }
              disabled={isPending}
            >
              <SelectTrigger id="outlet_selection_timing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="before">Before the menu (branch chooser)</SelectItem>
                <SelectItem value="after">At checkout (beside the order type)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Unified Modifier Groups Feature Toggle Section
function ModifierGroupsFeatureSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Modifier Groups</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Unified option groups that replace separate variations and add-ons. Each group sets its own
          minimum and maximum number of picks, so customers can choose several options at once.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="modifier_groups_enabled">Enable Modifier Groups</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, the tenant admin can author multi-select option groups (e.g. &ldquo;pick
              any 2 of 4 toppings&rdquo;) and the storefront enforces the min/max rules at checkout
            </p>
          </div>
          <Switch
            id="modifier_groups_enabled"
            checked={formData.modifier_groups_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, modifier_groups_enabled: checked })}
            disabled={isPending}
          />
        </div>
        {!formData.modifier_groups_enabled && (
          <p className="text-sm text-muted-foreground">
            Items already authored with modifier groups keep their data; the storefront simply falls
            back to the legacy variation and add-on sections while this is off.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// Bundles Feature Toggle Section
function BundlesFeatureSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bundles</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Allow admins to create menu item bundles with special pricing for upsells and menu display
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="bundles_enabled">Enable Bundles</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, the tenant admin can create, manage, and display curated bundles of menu items
            </p>
          </div>
          <Switch
            id="bundles_enabled"
            checked={formData.bundles_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, bundles_enabled: checked })}
            disabled={isPending}
          />
        </div>
        {!formData.bundles_enabled && (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-sky-400">Disabled:</strong> Bundle management will not appear in the admin dashboard and customers will not see bundles on the menu.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Pairing Rules Feature Toggle Section
function PairingRulesFeatureSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pairing Rules</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Enable tag-based pairing rules for automated complementary item suggestions
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="pairing_rules_enabled">Enable Pairing Rules</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, the system uses tag-based rules to automatically suggest complementary items to customers
            </p>
          </div>
          <Switch
            id="pairing_rules_enabled"
            checked={formData.pairing_rules_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, pairing_rules_enabled: checked })}
            disabled={isPending}
          />
        </div>
        {!formData.pairing_rules_enabled && (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-sky-400">Disabled:</strong> Tag-based pairing rules will not be evaluated and no automatic complementary suggestions will be generated from rules.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// QR-Handoff Ordering Feature Toggle Section
function QrHandoffFeatureSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>QR-Handoff Ordering</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Customers build an order on the web and get a QR code instead of a Messenger redirect. The vendor scans it in the admin app to confirm and create the order.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="qr_handoff_enabled">Enable QR-Handoff Ordering</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, web checkout skips Messenger and shows a QR thank-you page. Nothing is written until the vendor scans and accepts the QR.
            </p>
          </div>
          <Switch
            id="qr_handoff_enabled"
            checked={formData.qr_handoff_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, qr_handoff_enabled: checked })}
            disabled={isPending}
          />
        </div>
        {!formData.qr_handoff_enabled && (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-sky-400">Disabled:</strong> Web checkout uses the standard Messenger flow. The QR thank-you page will not be shown.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Restaurant Address Section (for Lalamove pickup)
function RestaurantAddressSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Restaurant Address</CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Required for Lalamove delivery pickup location
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="restaurant_address">Address *</Label>
          <MapboxAddressAutocomplete
            value={formData.restaurant_address}
            onChange={(address, coordinates) => {
              setFormData({
                ...formData,
                restaurant_address: address,
                restaurant_latitude: coordinates?.lat.toString() || '',
                restaurant_longitude: coordinates?.lng.toString() || '',
              })
            }}
            placeholder="Enter restaurant address"
            required
            mapboxEnabled={true}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="restaurant_latitude">Latitude *</Label>
            <Input
              id="restaurant_latitude"
              type="number"
              step="any"
              value={formData.restaurant_latitude}
              onChange={(e) => setFormData({ ...formData, restaurant_latitude: e.target.value })}
              placeholder="22.3193"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="restaurant_longitude">Longitude *</Label>
            <Input
              id="restaurant_longitude"
              type="number"
              step="any"
              value={formData.restaurant_longitude}
              onChange={(e) => setFormData({ ...formData, restaurant_longitude: e.target.value })}
              placeholder="114.1694"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4">
          <p className="text-sm text-white/70">
            <strong className="text-sky-400">Tip:</strong> Use the map picker above to automatically fill in coordinates, or use Google Maps to find your restaurant coordinates manually.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// Lalamove Delivery Configuration Section
function LalamoveSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lalamove Delivery Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="lalamove_enabled">Enable Lalamove Delivery</Label>
            <p className="text-sm text-muted-foreground">
              Integrate Lalamove for automatic delivery management
            </p>
          </div>
          <Switch
            id="lalamove_enabled"
            checked={formData.lalamove_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, lalamove_enabled: checked })}
            disabled={isPending}
          />
        </div>

        {formData.lalamove_enabled && (
          <>
            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lalamove_api_key">API Key *</Label>
                <Input
                  id="lalamove_api_key"
                  type="password"
                  value={formData.lalamove_api_key}
                  onChange={(e) => setFormData({ ...formData, lalamove_api_key: e.target.value })}
                  placeholder="Your Lalamove API key"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lalamove_secret_key">Secret Key *</Label>
                <Input
                  id="lalamove_secret_key"
                  type="password"
                  value={formData.lalamove_secret_key}
                  onChange={(e) => setFormData({ ...formData, lalamove_secret_key: e.target.value })}
                  placeholder="Your Lalamove secret key"
                  disabled={isPending}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lalamove_market">Market *</Label>
                  <Input
                    id="lalamove_market"
                    value={formData.lalamove_market}
                    onChange={(e) => setFormData({ ...formData, lalamove_market: e.target.value.toUpperCase() })}
                    placeholder="HK, SG, TH, etc."
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Country code (e.g., HK for Hong Kong)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lalamove_service_type">Service Type *</Label>
                  <select
                    id="lalamove_service_type"
                    value={formData.lalamove_service_type}
                    onChange={(e) => setFormData({ ...formData, lalamove_service_type: e.target.value })}
                    disabled={isPending}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {LALAMOVE_SERVICE_TYPES.map((type) => (
                      <option key={type} value={type} className="bg-background text-foreground">
                        {type}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Vehicle type for delivery
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lalamove_sender_phone">Pickup Contact Phone</Label>
                <Input
                  id="lalamove_sender_phone"
                  value={formData.lalamove_sender_phone}
                  onChange={(e) => setFormData({ ...formData, lalamove_sender_phone: e.target.value })}
                  placeholder="e.g. 09171234567 (store number)"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  The store number the driver calls for pickup. Falls back to the footer phone if blank.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="lalamove_sandbox">Sandbox Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Use test environment for development
                  </p>
                </div>
                <Switch
                  id="lalamove_sandbox"
                  checked={formData.lalamove_sandbox}
                  onCheckedChange={(checked) => setFormData({ ...formData, lalamove_sandbox: checked })}
                  disabled={isPending}
                />
              </div>

              {formData.lalamove_sandbox && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
                  <p className="text-sm text-white/70">
                    <strong className="text-amber-400">Testing Mode:</strong> Using sandbox environment. No real deliveries will be created.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Loyverse POS Integration Section. Catalog syncs in from Loyverse; orders
// push out as completed receipts (Loyverse has no open-ticket API, so the
// incoming-order experience stays on our side).
function LoyverseSection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  const [isTesting, setIsTesting] = useState(false)
  const [connection, setConnection] = useState<LoyverseConnectionTest | null>(null)

  const handleTestConnection = async () => {
    setIsTesting(true)
    try {
      const result = await testLoyverseConnectionAction(formData.loyverse_access_token)
      setConnection(result)
      if (result.success) {
        toast.success(`Connected to ${result.merchant.business_name || 'Loyverse'}`)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Could not reach the Loyverse API')
    } finally {
      setIsTesting(false)
    }
  }

  const stores = connection?.success ? connection.stores : []
  const paymentTypes = connection?.success ? connection.paymentTypes : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Loyverse POS Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="loyverse_enabled">Enable Loyverse</Label>
            <p className="text-sm text-muted-foreground">
              Sync the menu from Loyverse and push orders as sales receipts
            </p>
          </div>
          <Switch
            id="loyverse_enabled"
            checked={formData.loyverse_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, loyverse_enabled: checked })}
            disabled={isPending}
          />
        </div>

        {formData.loyverse_enabled && (
          <>
            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loyverse_access_token">Access Token *</Label>
                <div className="flex gap-2">
                  <Input
                    id="loyverse_access_token"
                    type="password"
                    value={formData.loyverse_access_token}
                    onChange={(e) => setFormData({ ...formData, loyverse_access_token: e.target.value })}
                    placeholder="Loyverse personal access token"
                    disabled={isPending}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isPending || isTesting || !formData.loyverse_access_token.trim()}
                  >
                    {isTesting ? 'Testing…' : 'Test connection'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Back Office → Integrations → Access tokens. Test the connection to load stores and payment types.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="loyverse_store_id">Store *</Label>
                  {stores.length > 0 ? (
                    <select
                      id="loyverse_store_id"
                      value={formData.loyverse_store_id}
                      onChange={(e) => setFormData({ ...formData, loyverse_store_id: e.target.value })}
                      disabled={isPending}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="" className="bg-background text-foreground">Select a store…</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id} className="bg-background text-foreground">
                          {store.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="loyverse_store_id"
                      value={formData.loyverse_store_id}
                      onChange={(e) => setFormData({ ...formData, loyverse_store_id: e.target.value })}
                      placeholder="Loyverse store ID"
                      disabled={isPending}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Receipts are created in this store; its prices are used for the menu.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loyverse_payment_type_id">Payment Type</Label>
                  {paymentTypes.length > 0 ? (
                    <select
                      id="loyverse_payment_type_id"
                      value={formData.loyverse_payment_type_id}
                      onChange={(e) => setFormData({ ...formData, loyverse_payment_type_id: e.target.value })}
                      disabled={isPending}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="" className="bg-background text-foreground">None (push unpaid)</option>
                      {paymentTypes.map((pt) => (
                        <option key={pt.id} value={pt.id} className="bg-background text-foreground">
                          {pt.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="loyverse_payment_type_id"
                      value={formData.loyverse_payment_type_id}
                      onChange={(e) => setFormData({ ...formData, loyverse_payment_type_id: e.target.value })}
                      placeholder="Payment type ID (optional)"
                      disabled={isPending}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Recorded on pushed receipts. Leave empty to push without a payment line.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loyverse_push_mode">When to push orders</Label>
                <select
                  id="loyverse_push_mode"
                  value={formData.loyverse_push_mode}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      loyverse_push_mode: e.target.value === 'on_create' ? 'on_create' : 'on_confirm',
                    })
                  }
                  disabled={isPending}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="on_confirm" className="bg-background text-foreground">
                    After the order is confirmed (recommended)
                  </option>
                  <option value="on_create" className="bg-background text-foreground">
                    Immediately when the order is placed
                  </option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Loyverse only accepts completed sales receipts — orders never appear on the Loyverse register screen.
                </p>
              </div>

              {connection?.success && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <p className="text-sm text-white/70">
                    <strong className="text-emerald-400">Connected:</strong>{' '}
                    {connection.merchant.business_name || 'Loyverse account'} — {stores.length} store{stores.length === 1 ? '' : 's'}, {paymentTypes.length} payment type{paymentTypes.length === 1 ? '' : 's'}.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Distance-Based Delivery Fee Section (non-Lalamove pricing path)
function DistanceDeliverySection({
  formData,
  setFormData,
  isPending
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  const lalamoveOverrides = formData.lalamove_enabled
  return (
    <Card>
      <CardHeader>
        <CardTitle>Distance-Based Delivery Fee</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="distance_delivery_enabled">Enable Distance-Based Delivery</Label>
            <p className="text-sm text-muted-foreground">
              Auto-calculate the delivery fee from the distance between the store and the
              customer&apos;s address. Use this when the tenant is NOT using Lalamove.
            </p>
          </div>
          <Switch
            id="distance_delivery_enabled"
            checked={formData.distance_delivery_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, distance_delivery_enabled: checked })}
            disabled={isPending}
          />
        </div>

        {lalamoveOverrides && formData.distance_delivery_enabled && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-amber-400">Lalamove is enabled.</strong> Lalamove rates take
              precedence, so this distance-based fee will be ignored until Lalamove is turned off.
            </p>
          </div>
        )}

        {formData.distance_delivery_enabled && (
          <>
            <Separator />

            <p className="text-xs text-muted-foreground">
              Fee = max(minimum fee, distance in km × price per km). The store location is set in the
              Restaurant Address section above. Addresses beyond the radius are blocked from delivery.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="delivery_radius_km">Delivery Radius (km) *</Label>
                <Input
                  id="delivery_radius_km"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.delivery_radius_km}
                  onChange={(e) => setFormData({ ...formData, delivery_radius_km: e.target.value })}
                  placeholder="15"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delivery_price_per_km">Price per km *</Label>
                <Input
                  id="delivery_price_per_km"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.delivery_price_per_km}
                  onChange={(e) => setFormData({ ...formData, delivery_price_per_km: e.target.value })}
                  placeholder="15"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delivery_min_fee">Minimum Fee *</Label>
                <Input
                  id="delivery_min_fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.delivery_min_fee}
                  onChange={(e) => setFormData({ ...formData, delivery_min_fee: e.target.value })}
                  placeholder="49"
                  disabled={isPending}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Email Notifications Section
function EmailNotificationsSection({
  formData,
  setFormData,
  isPending,
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Email Notifications</Label>
            <p className="text-xs text-muted-foreground">
              Send order notification emails to the restaurant via PostHog
            </p>
          </div>
          <Switch
            checked={formData.email_notifications_enabled}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, email_notifications_enabled: checked }))}
            disabled={isPending}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="admin_email">Restaurant Email Address</Label>
          <Input
            id="admin_email"
            type="email"
            value={formData.admin_email}
            onChange={(e) => setFormData(prev => ({ ...prev, admin_email: e.target.value }))}
            placeholder="restaurant@example.com"
            disabled={isPending || !formData.email_notifications_enabled}
          />
          <p className="text-xs text-muted-foreground">
            Orders will be sent to this email when a new order is placed
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// Convex / Mobile App Configuration Section
function ConvexMobileAppSection({
  formData,
  setFormData,
  isPending,
  tenant,
}: {
  formData: TenantFormData
  setFormData: SetFormData
  isPending: boolean
  tenant?: Tenant
}) {
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployStatus, setDeployStatus] = useState<string | null>(null)

  const handleDeployConvex = async () => {
    if (!tenant?.id) return
    setIsDeploying(true)
    setDeployStatus(null)
    try {
      const result = await deployConvexToTenantAction(tenant.id)
      if (result.success) {
        setDeployStatus('Schema deployed successfully!')
      } else {
        setDeployStatus(`Deploy failed: ${result.error}`)
      }
    } catch {
      setDeployStatus('Deploy failed: unexpected error')
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Convex / Mobile App</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Configure Convex backend for real-time order tracking and mobile app support
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="convex_deployment_url">Convex Deployment URL</Label>
          <Input
            id="convex_deployment_url"
            value={formData.convex_deployment_url}
            onChange={(e) => setFormData({ ...formData, convex_deployment_url: e.target.value })}
            placeholder="https://your-project.convex.cloud"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="convex_deploy_key">Convex Deploy Key</Label>
          <Input
            id="convex_deploy_key"
            type="password"
            value={formData.convex_deploy_key}
            onChange={(e) => setFormData({ ...formData, convex_deploy_key: e.target.value })}
            placeholder="prod:your-deployment|key..."
            disabled={isPending}
          />
        </div>

        {tenant?.convex_schema_version != null && (
          <div className="space-y-2">
            <Label>Current Schema Version</Label>
            <p className="text-sm text-muted-foreground">
              v{tenant.convex_schema_version}
            </p>
          </div>
        )}

        {tenant?.id && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleDeployConvex}
              disabled={
                isDeploying ||
                isPending ||
                !formData.convex_deployment_url ||
                !formData.convex_deploy_key
              }
            >
              {isDeploying ? 'Deploying...' : 'Deploy Schema to Convex'}
            </Button>
            {deployStatus && (
              <p className={`text-sm ${deployStatus.startsWith('Deploy failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                {deployStatus}
              </p>
            )}
          </div>
        )}

        <Separator />

        <OrderBackendPicker
          value={formData.order_backend}
          onChange={(order_backend) => setFormData({ ...formData, order_backend })}
          hasConvexUrl={Boolean(formData.convex_deployment_url)}
          isPending={isPending}
        />

        {!formData.convex_deployment_url && (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4">
            <p className="text-sm text-white/70">
              <strong className="text-sky-400">Note:</strong> Without Convex configuration, orders will only be stored in Supabase. Configure Convex to enable real-time order tracking and mobile app support.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function TenantFormWrapper({
  tenant,
  prefill,
  usersSlot,
  importSlot,
  statsSlot,
}: TenantFormWrapperProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const [formData, setFormData] = useState<TenantFormData>({
    name: tenant?.name || prefill?.name || '',
    slug: tenant?.slug || '',
    domain: tenant?.domain || '',
    logo_url: tenant?.logo_url || '',
    primary_color: tenant?.primary_color || '#c41e3a',
    secondary_color: tenant?.secondary_color || '#009246',
    accent_color: tenant?.accent_color || '',
    // Extended branding colors
    background_color: tenant?.background_color || '',
    header_color: tenant?.header_color || '',
    header_font_color: tenant?.header_font_color || '',
    cards_color: tenant?.cards_color || '',
    cards_border_color: tenant?.cards_border_color || '',
    button_primary_color: tenant?.button_primary_color || '',
    button_primary_text_color: tenant?.button_primary_text_color || '',
    button_secondary_color: tenant?.button_secondary_color || '',
    button_secondary_text_color: tenant?.button_secondary_text_color || '',
    text_primary_color: tenant?.text_primary_color || '',
    text_secondary_color: tenant?.text_secondary_color || '',
    text_muted_color: tenant?.text_muted_color || '',
    border_color: tenant?.border_color || '',
    success_color: tenant?.success_color || '',
    warning_color: tenant?.warning_color || '',
    error_color: tenant?.error_color || '',
    link_color: tenant?.link_color || '',
    shadow_color: tenant?.shadow_color || '',
    messenger_page_id: tenant?.messenger_page_id || '',
    messenger_username: tenant?.messenger_username || '',
    messenger_redirect_mode: tenant?.messenger_redirect_mode || 'webhook',
    is_active: tenant?.is_active ?? true,
    mapbox_enabled: tenant?.mapbox_enabled ?? true,
    enable_order_management: tenant?.enable_order_management ?? true,
    // Menu engineering
    menu_engineering_enabled: tenant?.menu_engineering_enabled ?? false,
    checkout_upsell_enabled: tenant?.checkout_upsell_enabled ?? false,
    hide_currency_symbol: tenant?.hide_currency_symbol ?? false,
    // Flash screen
    flash_screen_feature_enabled: tenant?.flash_screen_feature_enabled ?? false,
    // Bundles
    bundles_enabled: tenant?.bundles_enabled ?? false,
    modifier_groups_enabled: tenant?.modifier_groups_enabled ?? false,
    // Inventory
    inventory_enabled: tenant?.inventory_enabled ?? false,
    // Multi-branch — missing/null on every existing row reads as off.
    multi_branch_enabled: tenant?.multi_branch_enabled ?? false,
    // Missing/null/unknown reads as 'before' — the behaviour that shipped first.
    outlet_selection_timing: tenant?.outlet_selection_timing === 'after' ? 'after' : 'before',
    low_stock_alerts_enabled: tenant?.low_stock_alerts_enabled ?? false,
    auto_86_enabled: tenant?.auto_86_enabled ?? false,
    // Pairing rules
    pairing_rules_enabled: tenant?.pairing_rules_enabled ?? false,
    // QR-handoff ordering
    qr_handoff_enabled: tenant?.qr_handoff_enabled ?? false,
    // Restaurant address
    restaurant_address: tenant?.restaurant_address || '',
    restaurant_latitude: tenant?.restaurant_latitude?.toString() || '',
    restaurant_longitude: tenant?.restaurant_longitude?.toString() || '',
    // Lalamove configuration
    lalamove_enabled: tenant?.lalamove_enabled ?? false,
    lalamove_api_key: tenant?.lalamove_api_key || '',
    lalamove_secret_key: tenant?.lalamove_secret_key || '',
    lalamove_market: tenant?.lalamove_market || 'HK',
    lalamove_service_type: tenant?.lalamove_service_type || 'MOTORCYCLE',
    lalamove_sandbox: tenant?.lalamove_sandbox ?? true,
    lalamove_sender_phone: tenant?.lalamove_sender_phone || '',
    // Loyverse POS integration
    loyverse_enabled: tenant?.loyverse_enabled ?? false,
    loyverse_access_token: tenant?.loyverse_access_token || '',
    loyverse_store_id: tenant?.loyverse_store_id || '',
    loyverse_payment_type_id: tenant?.loyverse_payment_type_id || '',
    loyverse_push_mode: tenant?.loyverse_push_mode === 'on_create' ? 'on_create' : 'on_confirm',
    // Distance-based delivery fee
    distance_delivery_enabled: tenant?.distance_delivery_enabled ?? false,
    delivery_price_per_km: tenant?.delivery_price_per_km?.toString() || '',
    delivery_min_fee: tenant?.delivery_min_fee?.toString() || '',
    delivery_radius_km: tenant?.delivery_radius_km?.toString() || '',
    // Convex / Mobile App
    convex_deployment_url: tenant?.convex_deployment_url || '',
    convex_deploy_key: tenant?.convex_deploy_key || '',
    order_backend: orderBackendPreferenceOf(tenant ?? {}),
    // Email notifications
    admin_email: tenant?.admin_email || prefill?.email || '',
    email_notifications_enabled: tenant?.email_notifications_enabled ?? false,
  })

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    const input = {
      name: formData.name,
      slug: formData.slug,
      domain: formData.domain || '',
      logo_url: formData.logo_url || undefined,
      primary_color: formData.primary_color,
      secondary_color: formData.secondary_color,
      accent_color: formData.accent_color || undefined,
      // Extended branding colors
      background_color: formData.background_color || undefined,
      header_color: formData.header_color || undefined,
      header_font_color: formData.header_font_color || undefined,
      cards_color: formData.cards_color || undefined,
      cards_border_color: formData.cards_border_color || undefined,
      button_primary_color: formData.button_primary_color || undefined,
      button_primary_text_color: formData.button_primary_text_color || undefined,
      button_secondary_color: formData.button_secondary_color || undefined,
      button_secondary_text_color: formData.button_secondary_text_color || undefined,
      text_primary_color: formData.text_primary_color || undefined,
      text_secondary_color: formData.text_secondary_color || undefined,
      text_muted_color: formData.text_muted_color || undefined,
      border_color: formData.border_color || undefined,
      success_color: formData.success_color || undefined,
      warning_color: formData.warning_color || undefined,
      error_color: formData.error_color || undefined,
      link_color: formData.link_color || undefined,
      shadow_color: formData.shadow_color || undefined,
      messenger_page_id: formData.messenger_page_id,
      messenger_username: formData.messenger_username || undefined,
      messenger_redirect_mode: formData.messenger_redirect_mode,
      is_active: formData.is_active,
      mapbox_enabled: formData.mapbox_enabled,
      enable_order_management: formData.enable_order_management,
      // Menu engineering
      menu_engineering_enabled: formData.menu_engineering_enabled,
      checkout_upsell_enabled: formData.checkout_upsell_enabled,
      hide_currency_symbol: formData.hide_currency_symbol,
      // Flash screen
      flash_screen_feature_enabled: formData.flash_screen_feature_enabled,
      // Bundles
      bundles_enabled: formData.bundles_enabled,
      modifier_groups_enabled: formData.modifier_groups_enabled,
      // Inventory
      inventory_enabled: formData.inventory_enabled,
      multi_branch_enabled: formData.multi_branch_enabled,
      outlet_selection_timing: formData.outlet_selection_timing,
      low_stock_alerts_enabled: formData.low_stock_alerts_enabled,
      auto_86_enabled: formData.auto_86_enabled,
      // Pairing rules
      pairing_rules_enabled: formData.pairing_rules_enabled,
      // QR-handoff ordering
      qr_handoff_enabled: formData.qr_handoff_enabled,
      // Restaurant address
      restaurant_address: formData.restaurant_address || undefined,
      restaurant_latitude: formData.restaurant_latitude ? parseFloat(formData.restaurant_latitude) : undefined,
      restaurant_longitude: formData.restaurant_longitude ? parseFloat(formData.restaurant_longitude) : undefined,
      // Lalamove configuration
      lalamove_enabled: formData.lalamove_enabled,
      lalamove_api_key: formData.lalamove_api_key || undefined,
      lalamove_secret_key: formData.lalamove_secret_key || undefined,
      lalamove_market: formData.lalamove_market || undefined,
      lalamove_service_type: formData.lalamove_service_type || undefined,
      lalamove_sandbox: formData.lalamove_sandbox,
      lalamove_sender_phone: formData.lalamove_sender_phone || undefined,
      // Loyverse POS integration
      loyverse_enabled: formData.loyverse_enabled,
      loyverse_access_token: formData.loyverse_access_token || undefined,
      loyverse_store_id: formData.loyverse_store_id || undefined,
      loyverse_payment_type_id: formData.loyverse_payment_type_id || undefined,
      loyverse_push_mode: formData.loyverse_push_mode,
      // Distance-based delivery fee
      distance_delivery_enabled: formData.distance_delivery_enabled,
      delivery_price_per_km: formData.delivery_price_per_km ? parseFloat(formData.delivery_price_per_km) : null,
      delivery_min_fee: formData.delivery_min_fee ? parseFloat(formData.delivery_min_fee) : null,
      delivery_radius_km: formData.delivery_radius_km ? parseFloat(formData.delivery_radius_km) : null,
      // Convex / Mobile App
      convex_deployment_url: formData.convex_deployment_url || undefined,
      convex_deploy_key: formData.convex_deploy_key || undefined,
      order_backend: formData.order_backend,
      // Email notifications
      admin_email: formData.admin_email || null,
      email_notifications_enabled: formData.email_notifications_enabled,
    }

    setIsPending(true)
    try {
      if (tenant) {
        const result = await updateTenantAction(tenant.id, input)
        if (result?.error) {
          toast.error(result.error)
          return
        }
        toast.success('Tenant updated!')
        router.push('/superadmin/tenants')
      } else {
        // createTenantAction returns error or redirects on success
        const result = await createTenantAction(input, prefill?.leadId)
        if (result?.error) {
          toast.error(result.error)
          return
        }
        // If no error, redirect happened (redirect() throws NEXT_REDIRECT)
      }
    } catch (err) {
      // Check if it's a redirect error (expected behavior)
      if (err && typeof err === 'object' && 'digest' in err) {
        // This is likely a NEXT_REDIRECT error, which is expected
        return
      }
      const message = err instanceof Error ? err.message : 'Failed to save tenant'
      toast.error(message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Sticky workspace header */}
      <div className="sticky top-0 z-30 rounded-2xl border border-white/10 bg-[#0a0a0a]/80 px-5 py-4 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <TenantMonogram
              tenant={
                tenant ?? {
                  name: formData.name || 'New',
                  logo_url: formData.logo_url,
                  primary_color: formData.primary_color,
                }
              }
              size="md"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="truncate text-xl font-bold tracking-tight text-white">
                  {formData.name || 'New Restaurant'}
                </h1>
                {tenant ? <StatusBadge active={formData.is_active} /> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-white/55">
                <span className="font-mono text-white/55">/{formData.slug || 'slug'}</span>
                {formData.domain ? (
                  <>
                    <span className="text-white/30">·</span>
                    <span className="text-white/55">{formData.domain}</span>
                  </>
                ) : null}
              </div>
              {statsSlot ? <div className="mt-2">{statsSlot}</div> : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {tenant ? (
              <Button
                asChild
                variant="outline"
                className="border-white/15 text-white hover:bg-white/10"
              >
                <Link href={`/${tenant.slug}/menu`} target="_blank">
                  View live menu
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="border-white/15 text-white hover:bg-white/10"
              onClick={() => router.push('/superadmin/tenants')}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-white text-black hover:bg-white/90"
              onClick={() => handleSubmit()}
              disabled={isPending}
            >
              {isPending ? 'Saving…' : tenant ? 'Save changes' : 'Create tenant'}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabbed workspace */}
      <Tabs defaultValue="general">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          {tenant ? <TabsTrigger value="team">Team</TabsTrigger> : null}
          {tenant ? <TabsTrigger value="import">Import</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <BasicInfoSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
        </TabsContent>

        <TabsContent value="branding" className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <BrandingSection
                formData={formData}
                setFormData={setFormData}
                isPending={isPending}
              />
              <ExtendedBrandingSection
                formData={formData}
                setFormData={setFormData}
                isPending={isPending}
              />
            </div>
            <div className="h-fit xl:sticky xl:top-28">
              <TenantBrandPreview formData={formData} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="features" className="mt-6 space-y-6">
          <MenuEngineeringSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <ModifierGroupsFeatureSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <BundlesFeatureSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <InventoryFeatureSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <MultiBranchFeatureSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <PairingRulesFeatureSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <QrHandoffFeatureSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <FlashScreenFeatureSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <OrderManagementSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <MapboxSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
        </TabsContent>

        <TabsContent value="integrations" className="mt-6 space-y-6">
          <MessengerSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <MessengerModeSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <EmailNotificationsSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <ConvexMobileAppSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
            tenant={tenant}
          />
        </TabsContent>

        <TabsContent value="delivery" className="mt-6 space-y-6">
          <RestaurantAddressSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <LalamoveSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <LoyverseSection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
          <DistanceDeliverySection
            formData={formData}
            setFormData={setFormData}
            isPending={isPending}
          />
        </TabsContent>

        {tenant ? (
          <TabsContent value="team" className="mt-6 space-y-6">
            {usersSlot}
          </TabsContent>
        ) : null}

        {tenant ? (
          <TabsContent value="import" className="mt-6 space-y-6">
            {importSlot}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
