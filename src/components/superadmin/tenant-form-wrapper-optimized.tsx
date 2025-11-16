'use client'

import { useState, useTransition } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageUpload } from '@/components/shared/image-upload'
import type { Tenant } from '@/types/database'
import { createTenantAction, updateTenantAction } from '@/actions/tenants'
import { toast } from 'sonner'

interface TenantFormWrapperProps {
  tenant?: Tenant
}

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
  is_active: boolean
  mapbox_enabled: boolean
  enable_order_management: boolean
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
          <Label htmlFor="domain">Custom Domain</Label>
          <Input
            id="domain"
            value={formData.domain}
            onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
            placeholder="bellaitalia.com"
            disabled={isPending}
          />
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
            className="h-4 w-4"
            disabled={isPending}
          />
          <span className="text-sm font-medium">Active</span>
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

export function TenantFormWrapper({ tenant }: TenantFormWrapperProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  const [formData, setFormData] = useState<TenantFormData>({
    name: tenant?.name || '',
    slug: tenant?.slug || '',
    domain: tenant?.domain || '',
    logo_url: tenant?.logo_url || '',
    primary_color: tenant?.primary_color || '#c41e3a',
    secondary_color: tenant?.secondary_color || '#009246',
    accent_color: tenant?.accent_color || '#ffd700',
    // Extended branding colors
    background_color: tenant?.background_color || '#ffffff',
    header_color: tenant?.header_color || '#ffffff',
    header_font_color: tenant?.header_font_color || '#000000',
    cards_color: tenant?.cards_color || '#ffffff',
    cards_border_color: tenant?.cards_border_color || '#e5e7eb',
    button_primary_color: tenant?.button_primary_color || tenant?.primary_color || '#c41e3a',
    button_primary_text_color: tenant?.button_primary_text_color || '#ffffff',
    button_secondary_color: tenant?.button_secondary_color || '#f3f4f6',
    button_secondary_text_color: tenant?.button_secondary_text_color || '#111111',
    text_primary_color: tenant?.text_primary_color || '#111111',
    text_secondary_color: tenant?.text_secondary_color || '#6b7280',
    text_muted_color: tenant?.text_muted_color || '#9ca3af',
    border_color: tenant?.border_color || '#e5e7eb',
    success_color: tenant?.success_color || '#10b981',
    warning_color: tenant?.warning_color || '#f59e0b',
    error_color: tenant?.error_color || '#ef4444',
    link_color: tenant?.link_color || '#3b82f6',
    shadow_color: tenant?.shadow_color || 'rgba(0, 0, 0, 0.1)',
    messenger_page_id: tenant?.messenger_page_id || '',
    messenger_username: tenant?.messenger_username || '',
    is_active: tenant?.is_active ?? true,
    mapbox_enabled: (tenant as Tenant | undefined)?.mapbox_enabled ?? true,
    enable_order_management: (tenant as Tenant | undefined)?.enable_order_management ?? true,
    // Restaurant address
    restaurant_address: (tenant as Tenant | undefined)?.restaurant_address || '',
    restaurant_latitude: (tenant as Tenant | undefined)?.restaurant_latitude?.toString() || '',
    restaurant_longitude: (tenant as Tenant | undefined)?.restaurant_longitude?.toString() || '',
    // Lalamove configuration
    lalamove_enabled: (tenant as Tenant | undefined)?.lalamove_enabled ?? false,
    lalamove_api_key: (tenant as Tenant | undefined)?.lalamove_api_key || '',
    lalamove_secret_key: (tenant as Tenant | undefined)?.lalamove_secret_key || '',
    lalamove_market: (tenant as Tenant | undefined)?.lalamove_market || 'HK',
    lalamove_service_type: (tenant as Tenant | undefined)?.lalamove_service_type || 'MOTORCYCLE',
    lalamove_sandbox: (tenant as Tenant | undefined)?.lalamove_sandbox ?? true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const input = {
      name: formData.name,
      slug: formData.slug,
      domain: formData.domain || null,
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
      is_active: formData.is_active,
      mapbox_enabled: formData.mapbox_enabled,
      enable_order_management: formData.enable_order_management,
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
    }

    startTransition(async () => {
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
          // createTenantAction redirects on success
          await createTenantAction(input)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save tenant'
        toast.error(message)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <BasicInfoSection 
        formData={formData} 
        setFormData={setFormData} 
        isPending={isPending} 
      />
      
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
      
      <MessengerSection 
        formData={formData} 
        setFormData={setFormData} 
        isPending={isPending} 
      />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/superadmin/tenants')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : tenant ? 'Update Tenant' : 'Create Tenant'}
        </Button>
      </div>
    </form>
  )
}
