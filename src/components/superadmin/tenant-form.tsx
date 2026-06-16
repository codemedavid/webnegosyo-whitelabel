'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImageUpload } from '@/components/shared/image-upload'
import type { Tenant } from '@/types/database'
import { useCreateTenant, useUpdateTenant } from '@/lib/queries/tenants'
import { deployConvexToTenantAction } from '@/app/actions/convex'
import { toast } from 'sonner'

interface TenantFormProps {
  tenant?: Tenant
}

export function TenantForm({ tenant }: TenantFormProps) {
  const router = useRouter()
  const createMutation = useCreateTenant()
  const updateMutation = useUpdateTenant()

  const [isDeploying, setIsDeploying] = useState(false)
  const [deployStatus, setDeployStatus] = useState<string | null>(null)

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
    menu_engineering_enabled: tenant?.menu_engineering_enabled ?? false,
    checkout_upsell_enabled: tenant?.checkout_upsell_enabled ?? false,
    hide_currency_symbol: tenant?.hide_currency_symbol ?? false,
    bundles_enabled: tenant?.bundles_enabled ?? false,
    pairing_rules_enabled: tenant?.pairing_rules_enabled ?? false,
    // Email notifications
    admin_email: tenant?.admin_email || '',
    email_notifications_enabled: tenant?.email_notifications_enabled ?? false,
    // Convex / Mobile App
    convex_deployment_url: tenant?.convex_deployment_url || '',
    convex_deploy_key: tenant?.convex_deploy_key || '',
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
      // Distance-based delivery is configured via TenantFormWrapper (the live superadmin form);
      // this legacy form is unused but must satisfy the required schema field.
      distance_delivery_enabled: false,
      menu_engineering_enabled: formData.menu_engineering_enabled,
      checkout_upsell_enabled: formData.checkout_upsell_enabled,
      hide_currency_symbol: formData.hide_currency_symbol,
      bundles_enabled: formData.bundles_enabled,
      pairing_rules_enabled: formData.pairing_rules_enabled,
      // Email notifications
      admin_email: formData.admin_email || null,
      email_notifications_enabled: formData.email_notifications_enabled,
      // Convex / Mobile App
      convex_deployment_url: formData.convex_deployment_url || undefined,
      convex_deploy_key: formData.convex_deploy_key || undefined,
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
        onSuccess: () => {
          // The server action redirects on success, so this may not be reached
          // If it is reached (no redirect), just show success message
          toast.success('Tenant created!')
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="mb-5">
          <span className="inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
            Identity
          </span>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-white">Basic Information</h2>
        </div>
        <div className="space-y-4">
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
            <p className="text-xs text-white/45">
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
              className="h-4 w-4 accent-white"
            />
            <span className="text-sm font-medium text-white">Active</span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="mb-5">
          <span className="inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
            Theme
          </span>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-white">Branding</h2>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="primary_color">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="primary_color"
                  type="color"
                  value={formData.primary_color}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.primary_color}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  placeholder="#c41e3a"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_color">Secondary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="secondary_color"
                  type="color"
                  value={formData.secondary_color}
                  onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.secondary_color}
                  onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                  placeholder="#009246"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accent_color">Accent Color</Label>
              <div className="flex gap-2">
                <Input
                  id="accent_color"
                  type="color"
                  value={formData.accent_color}
                  onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.accent_color}
                  onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                  placeholder="#ffd700"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="mb-5">
          <span className="inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
            Theme
          </span>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-white">Extended Branding</h2>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="background_color">Background Color</Label>
              <div className="flex gap-2">
                <Input
                  id="background_color"
                  type="color"
                  value={formData.background_color}
                  onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.background_color}
                  onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
                  placeholder="#ffffff"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="header_color">Header Color</Label>
              <div className="flex gap-2">
                <Input
                  id="header_color"
                  type="color"
                  value={formData.header_color}
                  onChange={(e) => setFormData({ ...formData, header_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.header_color}
                  onChange={(e) => setFormData({ ...formData, header_color: e.target.value })}
                  placeholder="#ffffff"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="header_font_color">Header Font Color</Label>
              <div className="flex gap-2">
                <Input
                  id="header_font_color"
                  type="color"
                  value={formData.header_font_color}
                  onChange={(e) => setFormData({ ...formData, header_font_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.header_font_color}
                  onChange={(e) => setFormData({ ...formData, header_font_color: e.target.value })}
                  placeholder="#000000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cards_color">Cards Color</Label>
              <div className="flex gap-2">
                <Input
                  id="cards_color"
                  type="color"
                  value={formData.cards_color}
                  onChange={(e) => setFormData({ ...formData, cards_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.cards_color}
                  onChange={(e) => setFormData({ ...formData, cards_color: e.target.value })}
                  placeholder="#ffffff"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="button_primary_color">Primary Button Color</Label>
              <div className="flex gap-2">
                <Input
                  id="button_primary_color"
                  type="color"
                  value={formData.button_primary_color}
                  onChange={(e) => setFormData({ ...formData, button_primary_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.button_primary_color}
                  onChange={(e) => setFormData({ ...formData, button_primary_color: e.target.value })}
                  placeholder="#c41e3a"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="button_primary_text_color">Primary Button Text</Label>
              <div className="flex gap-2">
                <Input
                  id="button_primary_text_color"
                  type="color"
                  value={formData.button_primary_text_color}
                  onChange={(e) => setFormData({ ...formData, button_primary_text_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.button_primary_text_color}
                  onChange={(e) => setFormData({ ...formData, button_primary_text_color: e.target.value })}
                  placeholder="#ffffff"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="text_primary_color">Primary Text Color</Label>
              <div className="flex gap-2">
                <Input
                  id="text_primary_color"
                  type="color"
                  value={formData.text_primary_color}
                  onChange={(e) => setFormData({ ...formData, text_primary_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.text_primary_color}
                  onChange={(e) => setFormData({ ...formData, text_primary_color: e.target.value })}
                  placeholder="#111111"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="text_secondary_color">Secondary Text Color</Label>
              <div className="flex gap-2">
                <Input
                  id="text_secondary_color"
                  type="color"
                  value={formData.text_secondary_color}
                  onChange={(e) => setFormData({ ...formData, text_secondary_color: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.text_secondary_color}
                  onChange={(e) => setFormData({ ...formData, text_secondary_color: e.target.value })}
                  placeholder="#6b7280"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="mb-5">
          <span className="inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
            Integration
          </span>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-white">Messenger Integration</h2>
        </div>
        <div className="space-y-4">
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
            <p className="text-xs text-white/45">
              Optional: If provided, will use m.me/username instead of page ID
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="mb-5">
          <span className="inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
            Notifications
          </span>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-white">Email Notifications</h2>
        </div>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.email_notifications_enabled}
              onChange={(e) => setFormData({ ...formData, email_notifications_enabled: e.target.checked })}
              className="h-4 w-4 accent-white"
            />
            <span className="text-sm font-medium text-white">Enable Email Notifications</span>
          </label>
          <p className="text-xs text-white/45">
            Send order notification emails to the restaurant via PostHog Workflows
          </p>

          <div className="space-y-2">
            <Label htmlFor="admin_email">Restaurant Email Address</Label>
            <Input
              id="admin_email"
              type="email"
              value={formData.admin_email}
              onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
              placeholder="restaurant@example.com"
              disabled={!formData.email_notifications_enabled}
            />
            <p className="text-xs text-white/45">
              Orders will be sent to this email address when a new order is placed
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="mb-5">
          <span className="inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
            Mobile App
          </span>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-white">Convex / Mobile App</h2>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="convex_deployment_url">Convex Deployment URL</Label>
            <Input
              id="convex_deployment_url"
              value={formData.convex_deployment_url}
              onChange={(e) => setFormData({ ...formData, convex_deployment_url: e.target.value })}
              placeholder="https://your-project.convex.cloud"
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
            />
          </div>

          {tenant?.convex_schema_version != null && (
            <div className="space-y-2">
              <Label>Current Schema Version</Label>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-sm font-medium text-white/60">
                v{tenant.convex_schema_version}
              </span>
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
        </div>
      </section>

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
  )
}

