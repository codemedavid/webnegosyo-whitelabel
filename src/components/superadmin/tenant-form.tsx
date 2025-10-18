'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageUpload } from '@/components/shared/image-upload'
import type { Tenant } from '@/types/database'
import { useCreateTenant, useUpdateTenant } from '@/lib/queries/tenants'
import { toast } from 'sonner'

interface TenantFormProps {
  tenant?: Tenant
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
    messenger_page_id: tenant?.messenger_page_id || '',
    messenger_username: tenant?.messenger_username || '',
    is_active: tenant?.is_active ?? true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const input = {
      name: formData.name,
      slug: formData.slug,
      domain: formData.domain || undefined,
      logo_url: formData.logo_url || undefined,
      primary_color: formData.primary_color,
      secondary_color: formData.secondary_color,
      accent_color: formData.accent_color || undefined,
      messenger_page_id: formData.messenger_page_id,
      messenger_username: formData.messenger_username || undefined,
      is_active: formData.is_active,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
            value={formData.logo_url}
            onChange={(url) => setFormData({ ...formData, logo_url: url })}
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

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

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

