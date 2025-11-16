'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImageUpload } from '@/components/shared/image-upload'
import { Badge } from '@/components/ui/badge'
import { Eye, Palette, Monitor, Smartphone } from 'lucide-react'
import type { Tenant } from '@/types/database'
import { useCreateTenant, useUpdateTenant } from '@/lib/queries/tenants'
import { getTenantBranding, generateBrandingCSS, getContrastColor } from '@/lib/branding-utils'
import { toast } from 'sonner'

interface TenantFormProps {
  tenant?: Tenant
}

interface ColorFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  description?: string
  disabled?: boolean
}

function ColorField({ label, value, onChange, description, disabled }: ColorFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={label.toLowerCase().replace(/\s+/g, '_')}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={label.toLowerCase().replace(/\s+/g, '_')}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-20"
          disabled={disabled}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          disabled={disabled}
        />
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

export function TenantForm({ tenant }: TenantFormProps) {
  const router = useRouter()
  const createMutation = useCreateTenant()
  const updateMutation = useUpdateTenant()
  
  const [formData, setFormData] = useState({
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
    mapbox_enabled: tenant?.mapbox_enabled ?? true,
    enable_order_management: tenant?.enable_order_management ?? true,
    lalamove_enabled: tenant?.lalamove_enabled ?? false,
    lalamove_sandbox: tenant?.lalamove_sandbox ?? true,
  })

  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

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
      lalamove_enabled: formData.lalamove_enabled,
      lalamove_sandbox: formData.lalamove_sandbox,
    }

    if (tenant) {
      updateMutation.mutate(
        { id: tenant.id, input },
        {
          onSuccess: () => {
            toast.success('Tenant updated!')
            router.push('/superadmin/tenants')
          },
          onError: (err) => {
            const message = err instanceof Error ? err.message : 'Failed to update tenant'
            toast.error(message)
          },
        }
      )
    } else {
      createMutation.mutate(input, {
        onSuccess: (created) => {
          toast.success('Tenant created!')
          router.push(`/${created.slug}/menu`)
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'Failed to create tenant'
          toast.error(message)
        },
      })
    }
  }

  const generateSlug = () => {
    const slug = formData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    setFormData({ ...formData, slug })
  }

  const autoGenerateColors = () => {
    // Generate complementary colors based on primary color
    const primary = formData.primary_color
    setFormData({
      ...formData,
      button_primary_color: primary,
      button_primary_text_color: getContrastColor(primary),
      header_color: primary,
      header_font_color: getContrastColor(primary),
      link_color: primary,
    })
  }

  // Create a mock tenant for preview
  const mockTenant: Tenant = {
    id: 'preview',
    name: formData.name || 'Restaurant Name',
    slug: formData.slug || 'restaurant-slug',
    domain: formData.domain,
    logo_url: formData.logo_url,
    primary_color: formData.primary_color,
    secondary_color: formData.secondary_color,
    accent_color: formData.accent_color,
    background_color: formData.background_color,
    header_color: formData.header_color,
    header_font_color: formData.header_font_color,
    cards_color: formData.cards_color,
    cards_border_color: formData.cards_border_color,
    button_primary_color: formData.button_primary_color,
    button_primary_text_color: formData.button_primary_text_color,
    button_secondary_color: formData.button_secondary_color,
    button_secondary_text_color: formData.button_secondary_text_color,
    text_primary_color: formData.text_primary_color,
    text_secondary_color: formData.text_secondary_color,
    text_muted_color: formData.text_muted_color,
    border_color: formData.border_color,
    success_color: formData.success_color,
    warning_color: formData.warning_color,
    error_color: formData.error_color,
    link_color: formData.link_color,
    shadow_color: formData.shadow_color,
    messenger_page_id: formData.messenger_page_id,
    messenger_username: formData.messenger_username,
    is_active: formData.is_active,
    mapbox_enabled: formData.mapbox_enabled,
    enable_order_management: formData.enable_order_management,
    lalamove_enabled: formData.lalamove_enabled,
    lalamove_sandbox: formData.lalamove_sandbox,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const branding = getTenantBranding(mockTenant)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="messenger">Messenger</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6">
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
                    />
                    <Button type="button" variant="outline" onClick={generateSlug}>
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
                  />
                </div>

                <ImageUpload
                  currentImageUrl={formData.logo_url}
                  onImageUploaded={(url) => setFormData({ ...formData, logo_url: url })}
                  label="Restaurant Logo"
                  description="Upload your restaurant logo (recommended: square image)"
                  folder="tenants/logos"
                  disabled={createMutation.isPending || updateMutation.isPending}
                />

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">Active</span>
                </label>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Branding Colors
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={autoGenerateColors}
                  >
                    Auto Generate
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-4">Core Colors</h4>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <ColorField
                      label="Primary Color"
                      value={formData.primary_color}
                      onChange={(value) => setFormData({ ...formData, primary_color: value })}
                      description="Main brand color"
                    />
                    <ColorField
                      label="Secondary Color"
                      value={formData.secondary_color}
                      onChange={(value) => setFormData({ ...formData, secondary_color: value })}
                      description="Supporting color"
                    />
                    <ColorField
                      label="Accent Color"
                      value={formData.accent_color}
                      onChange={(value) => setFormData({ ...formData, accent_color: value })}
                      description="Highlight color"
                    />
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-4">Layout Colors</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField
                      label="Background Color"
                      value={formData.background_color}
                      onChange={(value) => setFormData({ ...formData, background_color: value })}
                      description="Main background"
                    />
                    <ColorField
                      label="Header Color"
                      value={formData.header_color}
                      onChange={(value) => setFormData({ ...formData, header_color: value })}
                      description="Navigation background"
                    />
                    <ColorField
                      label="Header Font Color"
                      value={formData.header_font_color}
                      onChange={(value) => setFormData({ ...formData, header_font_color: value })}
                      description="Navigation text"
                    />
                    <ColorField
                      label="Cards Color"
                      value={formData.cards_color}
                      onChange={(value) => setFormData({ ...formData, cards_color: value })}
                      description="Card backgrounds"
                    />
                    <ColorField
                      label="Cards Border Color"
                      value={formData.cards_border_color}
                      onChange={(value) => setFormData({ ...formData, cards_border_color: value })}
                      description="Card borders"
                    />
                    <ColorField
                      label="Border Color"
                      value={formData.border_color}
                      onChange={(value) => setFormData({ ...formData, border_color: value })}
                      description="General borders"
                    />
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-4">Button Colors</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField
                      label="Primary Button Color"
                      value={formData.button_primary_color}
                      onChange={(value) => setFormData({ ...formData, button_primary_color: value })}
                      description="Main button background"
                    />
                    <ColorField
                      label="Primary Button Text"
                      value={formData.button_primary_text_color}
                      onChange={(value) => setFormData({ ...formData, button_primary_text_color: value })}
                      description="Main button text"
                    />
                    <ColorField
                      label="Secondary Button Color"
                      value={formData.button_secondary_color}
                      onChange={(value) => setFormData({ ...formData, button_secondary_color: value })}
                      description="Secondary button background"
                    />
                    <ColorField
                      label="Secondary Button Text"
                      value={formData.button_secondary_text_color}
                      onChange={(value) => setFormData({ ...formData, button_secondary_text_color: value })}
                      description="Secondary button text"
                    />
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-4">Text Colors</h4>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <ColorField
                      label="Primary Text"
                      value={formData.text_primary_color}
                      onChange={(value) => setFormData({ ...formData, text_primary_color: value })}
                      description="Main text"
                    />
                    <ColorField
                      label="Secondary Text"
                      value={formData.text_secondary_color}
                      onChange={(value) => setFormData({ ...formData, text_secondary_color: value })}
                      description="Secondary text"
                    />
                    <ColorField
                      label="Muted Text"
                      value={formData.text_muted_color}
                      onChange={(value) => setFormData({ ...formData, text_muted_color: value })}
                      description="Muted text"
                    />
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-4">State Colors</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField
                      label="Success Color"
                      value={formData.success_color}
                      onChange={(value) => setFormData({ ...formData, success_color: value })}
                      description="Success messages"
                    />
                    <ColorField
                      label="Warning Color"
                      value={formData.warning_color}
                      onChange={(value) => setFormData({ ...formData, warning_color: value })}
                      description="Warning messages"
                    />
                    <ColorField
                      label="Error Color"
                      value={formData.error_color}
                      onChange={(value) => setFormData({ ...formData, error_color: value })}
                      description="Error messages"
                    />
                    <ColorField
                      label="Link Color"
                      value={formData.link_color}
                      onChange={(value) => setFormData({ ...formData, link_color: value })}
                      description="Links"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messenger" className="space-y-6">
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
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger_username">Messenger Username</Label>
                  <Input
                    id="messenger_username"
                    value={formData.messenger_username}
                    onChange={(e) => setFormData({ ...formData, messenger_username: e.target.value })}
                    placeholder="bellaitalia"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional: If provided, will use m.me/username instead of page ID
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Live Preview
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={previewMode === 'desktop' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreviewMode('desktop')}
                  >
                    <Monitor className="h-4 w-4 mr-2" />
                    Desktop
                  </Button>
                  <Button
                    type="button"
                    variant={previewMode === 'mobile' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreviewMode('mobile')}
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    Mobile
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div 
                  className={`border rounded-lg overflow-hidden ${previewMode === 'mobile' ? 'max-w-sm mx-auto' : 'w-full'}`}
                  style={generateBrandingCSS(branding)}
                >
                  {/* Header Preview */}
                  <div 
                    className="p-4 flex items-center justify-between"
                    style={{ 
                      backgroundColor: branding.header,
                      color: branding.headerFont 
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {formData.logo_url ? (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-xs">Logo</span>
                        </div>
                      ) : (
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                          style={{ backgroundColor: branding.primary }}
                        >
                          {formData.name?.charAt(0) || 'R'}
                        </div>
                      )}
                      <span className="font-bold">{formData.name || 'Restaurant Name'}</span>
                    </div>
                    <Badge style={{ backgroundColor: branding.primary, color: branding.buttonPrimaryText }}>
                      Cart (3)
                    </Badge>
                  </div>

                  {/* Content Preview */}
                  <div style={{ backgroundColor: branding.background, padding: '16px' }}>
                    <h3 style={{ color: branding.textPrimary, marginBottom: '12px' }}>
                      Our Menu
                    </h3>
                    
                    {/* Card Preview */}
                    <div 
                      className="rounded-lg p-4 mb-4"
                      style={{ 
                        backgroundColor: branding.cards,
                        borderColor: branding.cardsBorder,
                        borderWidth: '1px',
                        borderStyle: 'solid'
                      }}
                    >
                      <h4 style={{ color: branding.textPrimary, marginBottom: '8px' }}>
                        Featured Item
                      </h4>
                      <p style={{ color: branding.textSecondary, marginBottom: '12px' }}>
                        Delicious description of the menu item
                      </p>
                      <div className="flex gap-2">
                        <button 
                          className="px-4 py-2 rounded font-medium"
                          style={{ 
                            backgroundColor: branding.buttonPrimary,
                            color: branding.buttonPrimaryText 
                          }}
                        >
                          Add to Cart
                        </button>
                        <button 
                          className="px-4 py-2 rounded font-medium"
                          style={{ 
                            backgroundColor: branding.buttonSecondary,
                            color: branding.buttonSecondaryText 
                          }}
                        >
                          View Details
                        </button>
                      </div>
                    </div>

                    {/* Status Colors Preview */}
                    <div className="flex gap-2 text-sm">
                      <span style={{ color: branding.success }}>✓ Success</span>
                      <span style={{ color: branding.warning }}>⚠ Warning</span>
                      <span style={{ color: branding.error }}>✗ Error</span>
                      <span style={{ color: branding.link }}>Link</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/superadmin/tenants')}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending
              ? 'Saving...'
              : tenant 
              ? 'Update Tenant' 
              : 'Create Tenant'}
          </Button>
        </div>
      </form>
    </div>
  )
}
