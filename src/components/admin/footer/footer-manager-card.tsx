'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SimpleImageUpload } from '@/components/shared/simple-image-upload'
import { updateTenantFooterForAdminAction, type FooterUpdateInput } from '@/actions/tenants'
import { getFooterConfig, type FooterTheme } from '@/lib/footer-utils'
import { FooterView } from '@/components/customer/site-footer'
import type { Tenant } from '@/types/database'
import { toast } from 'sonner'

interface FooterManagerCardProps {
  tenant: Tenant
}

interface FooterFormState {
  footer_enabled: boolean
  footer_theme: FooterTheme
  footer_logo_url: string
  footer_business_name: string
  footer_tagline: string
  footer_address: string
  footer_phone: string
  footer_whatsapp: string
  footer_viber: string
  footer_email: string
  footer_facebook_url: string
  footer_instagram_url: string
  footer_tiktok_url: string
  footer_twitter_url: string
  footer_youtube_url: string
  footer_facebook_name: string
  footer_instagram_name: string
  footer_tiktok_name: string
  footer_twitter_name: string
  footer_youtube_name: string
  footer_about_us: string
  footer_terms_of_service: string
  footer_refund_policy: string
  footer_privacy_policy: string
  footer_copyright_text: string
  footer_show_powered_by: boolean
  footer_powered_by_text: string
  footer_background_color: string
  footer_text_color: string
  footer_heading_color: string
  footer_link_color: string
  footer_muted_color: string
  footer_icon_color: string
  footer_icon_background_color: string
  footer_border_color: string
}

const THEME_OPTIONS: ReadonlyArray<{ value: FooterTheme; label: string }> = [
  { value: 'auto', label: 'Auto (from branding)' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'brand', label: 'Brand' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'custom', label: 'Custom' },
]

const COLOR_FIELDS: ReadonlyArray<{ key: keyof FooterFormState; label: string }> = [
  { key: 'footer_background_color', label: 'Background' },
  { key: 'footer_text_color', label: 'Text' },
  { key: 'footer_heading_color', label: 'Heading' },
  { key: 'footer_link_color', label: 'Link' },
  { key: 'footer_muted_color', label: 'Muted' },
  { key: 'footer_icon_color', label: 'Icon Glyph' },
  { key: 'footer_icon_background_color', label: 'Icon Background' },
  { key: 'footer_border_color', label: 'Border' },
]

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function FooterManagerCard({ tenant }: FooterManagerCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Tenant rows carry the snake_case footer_* columns even when the local
  // Tenant type does not declare them, so read through an index view.
  const row = tenant as unknown as Record<string, unknown>

  const [formData, setFormData] = useState<FooterFormState>({
    footer_enabled: row['footer_enabled'] !== false,
    footer_theme: (readString(row['footer_theme']) || 'auto') as FooterTheme,
    footer_logo_url: readString(row['footer_logo_url']),
    footer_business_name: readString(row['footer_business_name']),
    footer_tagline: readString(row['footer_tagline']),
    footer_address: readString(row['footer_address']),
    footer_phone: readString(row['footer_phone']),
    footer_whatsapp: readString(row['footer_whatsapp']),
    footer_viber: readString(row['footer_viber']),
    footer_email: readString(row['footer_email']),
    footer_facebook_url: readString(row['footer_facebook_url']),
    footer_instagram_url: readString(row['footer_instagram_url']),
    footer_tiktok_url: readString(row['footer_tiktok_url']),
    footer_twitter_url: readString(row['footer_twitter_url']),
    footer_youtube_url: readString(row['footer_youtube_url']),
    footer_facebook_name: readString(row['footer_facebook_name']),
    footer_instagram_name: readString(row['footer_instagram_name']),
    footer_tiktok_name: readString(row['footer_tiktok_name']),
    footer_twitter_name: readString(row['footer_twitter_name']),
    footer_youtube_name: readString(row['footer_youtube_name']),
    footer_about_us: readString(row['footer_about_us']),
    footer_terms_of_service: readString(row['footer_terms_of_service']),
    footer_refund_policy: readString(row['footer_refund_policy']),
    footer_privacy_policy: readString(row['footer_privacy_policy']),
    footer_copyright_text: readString(row['footer_copyright_text']),
    footer_show_powered_by: row['footer_show_powered_by'] !== false,
    footer_powered_by_text: readString(row['footer_powered_by_text']),
    footer_background_color: readString(row['footer_background_color']),
    footer_text_color: readString(row['footer_text_color']),
    footer_heading_color: readString(row['footer_heading_color']),
    footer_link_color: readString(row['footer_link_color']),
    footer_muted_color: readString(row['footer_muted_color']),
    footer_icon_color: readString(row['footer_icon_color']),
    footer_icon_background_color: readString(row['footer_icon_background_color']),
    footer_border_color: readString(row['footer_border_color']),
  })

  const update = <K extends keyof FooterFormState>(key: K, value: FooterFormState[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    startTransition(async () => {
      const input: FooterUpdateInput = {
        footer_enabled: Boolean(formData.footer_enabled),
        footer_theme: String(formData.footer_theme),
        footer_logo_url: formData.footer_logo_url,
        footer_business_name: formData.footer_business_name,
        footer_tagline: formData.footer_tagline,
        footer_address: formData.footer_address,
        footer_phone: formData.footer_phone,
        footer_whatsapp: formData.footer_whatsapp,
        footer_viber: formData.footer_viber,
        footer_email: formData.footer_email,
        footer_facebook_url: formData.footer_facebook_url,
        footer_instagram_url: formData.footer_instagram_url,
        footer_tiktok_url: formData.footer_tiktok_url,
        footer_twitter_url: formData.footer_twitter_url,
        footer_youtube_url: formData.footer_youtube_url,
        footer_facebook_name: formData.footer_facebook_name,
        footer_instagram_name: formData.footer_instagram_name,
        footer_tiktok_name: formData.footer_tiktok_name,
        footer_twitter_name: formData.footer_twitter_name,
        footer_youtube_name: formData.footer_youtube_name,
        footer_about_us: formData.footer_about_us,
        footer_terms_of_service: formData.footer_terms_of_service,
        footer_refund_policy: formData.footer_refund_policy,
        footer_privacy_policy: formData.footer_privacy_policy,
        footer_copyright_text: formData.footer_copyright_text,
        footer_show_powered_by: Boolean(formData.footer_show_powered_by),
        footer_powered_by_text: formData.footer_powered_by_text,
        footer_background_color: formData.footer_background_color,
        footer_text_color: formData.footer_text_color,
        footer_heading_color: formData.footer_heading_color,
        footer_link_color: formData.footer_link_color,
        footer_muted_color: formData.footer_muted_color,
        footer_icon_color: formData.footer_icon_color,
        footer_icon_background_color: formData.footer_icon_background_color,
        footer_border_color: formData.footer_border_color,
      }

      try {
        const result = await updateTenantFooterForAdminAction(tenant.id, input)

        if (result.error) {
          toast.error(result.error)
          return
        }

        toast.success('Footer settings updated!')
        // The footer is server-rendered in the tenant layout, so refresh the
        // route to pull the saved values instead of leaving a stale footer.
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save footer settings'
        toast.error(message)
        console.error('[FooterManagerCard] Save failed:', err)
      }
    })
  }

  // Live preview: merge the raw tenant row with the current form state so the
  // footer re-renders on every keystroke / color change.
  const previewTenant = { ...row, ...formData }
  const previewConfig = getFooterConfig(previewTenant)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Footer &amp; Pages</CardTitle>
        <CardDescription>
          Customize your storefront footer and the public About / Terms / Refund / Privacy pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
          </TabsList>

          {/* ----------------------------- General ----------------------------- */}
          <TabsContent value="general" className="mt-4 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="footer-enabled">Enable Footer</Label>
                <p className="text-sm text-muted-foreground">
                  Show the footer on your storefront and menu pages.
                </p>
              </div>
              <Switch
                id="footer-enabled"
                checked={formData.footer_enabled}
                onCheckedChange={(checked) => update('footer_enabled', checked)}
                disabled={isPending}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="footer-theme">Theme</Label>
              <Select
                value={formData.footer_theme}
                onValueChange={(value) => update('footer_theme', value as FooterTheme)}
                disabled={isPending}
              >
                <SelectTrigger id="footer-theme" className="w-full">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pick a preset palette, or choose Custom and set colors in the Theme tab.
              </p>
            </div>

            <SimpleImageUpload
              currentImageUrl={formData.footer_logo_url}
              onImageUploaded={(url) => update('footer_logo_url', url)}
              folder="tenants/footer"
              label="Footer Logo"
              description="Optional logo shown at the top of the footer."
              disabled={isPending}
            />

            <div className="space-y-2">
              <Label htmlFor="footer-business-name">Business Name</Label>
              <Input
                id="footer-business-name"
                value={formData.footer_business_name}
                onChange={(e) => update('footer_business_name', e.target.value)}
                placeholder={tenant.name}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="footer-tagline">Tagline</Label>
              <Input
                id="footer-tagline"
                value={formData.footer_tagline}
                onChange={(e) => update('footer_tagline', e.target.value)}
                placeholder="A short line about your business."
                disabled={isPending}
              />
            </div>
          </TabsContent>

          {/* ----------------------------- Contact ----------------------------- */}
          <TabsContent value="contact" className="mt-4 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="footer-address">Address</Label>
              <Textarea
                id="footer-address"
                value={formData.footer_address}
                onChange={(e) => update('footer_address', e.target.value)}
                placeholder="123 Main St, City, Country"
                rows={3}
                disabled={isPending}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="footer-phone">Phone</Label>
                <Input
                  id="footer-phone"
                  value={formData.footer_phone}
                  onChange={(e) => update('footer_phone', e.target.value)}
                  placeholder="+63 900 000 0000"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footer-whatsapp">WhatsApp</Label>
                <Input
                  id="footer-whatsapp"
                  value={formData.footer_whatsapp}
                  onChange={(e) => update('footer_whatsapp', e.target.value)}
                  placeholder="+63 900 000 0000"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footer-viber">Viber</Label>
                <Input
                  id="footer-viber"
                  value={formData.footer_viber}
                  onChange={(e) => update('footer_viber', e.target.value)}
                  placeholder="+63 900 000 0000"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footer-email">Email</Label>
                <Input
                  id="footer-email"
                  type="email"
                  value={formData.footer_email}
                  onChange={(e) => update('footer_email', e.target.value)}
                  placeholder="hello@example.com"
                  disabled={isPending}
                />
              </div>
            </div>
          </TabsContent>

          {/* ----------------------------- Social ------------------------------ */}
          <TabsContent value="social" className="mt-4 space-y-6">
            <p className="text-sm text-muted-foreground">
              Add a link and an optional name shown beside the icon. Leave the name
              blank to use the platform name.
            </p>

            {([
              { platform: 'facebook', label: 'Facebook', urlPlaceholder: 'https://facebook.com/yourpage' },
              { platform: 'instagram', label: 'Instagram', urlPlaceholder: 'https://instagram.com/yourhandle' },
              { platform: 'tiktok', label: 'TikTok', urlPlaceholder: 'https://tiktok.com/@yourhandle' },
              { platform: 'twitter', label: 'Twitter / X', urlPlaceholder: 'https://x.com/yourhandle' },
              { platform: 'youtube', label: 'YouTube', urlPlaceholder: 'https://youtube.com/@yourchannel' },
            ] as const).map(({ platform, label, urlPlaceholder }) => {
              const urlKey = `footer_${platform}_url` as keyof FooterFormState
              const nameKey = `footer_${platform}_name` as keyof FooterFormState
              return (
                <div key={platform} className="space-y-2 rounded-lg border p-3">
                  <Label className="font-semibold">{label}</Label>
                  <Input
                    id={`footer-${platform}-url`}
                    value={formData[urlKey] as string}
                    onChange={(e) => update(urlKey, e.target.value)}
                    placeholder={urlPlaceholder}
                    disabled={isPending}
                  />
                  <Input
                    id={`footer-${platform}-name`}
                    value={formData[nameKey] as string}
                    onChange={(e) => update(nameKey, e.target.value)}
                    placeholder={`Name (e.g. ${label})`}
                    disabled={isPending}
                  />
                </div>
              )
            })}
          </TabsContent>

          {/* ------------------------------ Pages ------------------------------ */}
          <TabsContent value="pages" className="mt-4 space-y-6">
            <p className="text-sm text-muted-foreground">
              Each filled section becomes a public page, linked from the footer:
              {' '}
              <code className="rounded bg-muted px-1">/about</code>,{' '}
              <code className="rounded bg-muted px-1">/terms</code>,{' '}
              <code className="rounded bg-muted px-1">/refund</code>, and{' '}
              <code className="rounded bg-muted px-1">/privacy</code>. Leave a section empty to hide
              its page.
            </p>

            <div className="space-y-2">
              <Label htmlFor="footer-about">About Us</Label>
              <Textarea
                id="footer-about"
                value={formData.footer_about_us}
                onChange={(e) => update('footer_about_us', e.target.value)}
                placeholder="Tell customers about your business..."
                rows={6}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="footer-terms">Terms of Service</Label>
              <Textarea
                id="footer-terms"
                value={formData.footer_terms_of_service}
                onChange={(e) => update('footer_terms_of_service', e.target.value)}
                placeholder="Your terms of service..."
                rows={6}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="footer-refund">Refund / Cancellation Policy</Label>
              <Textarea
                id="footer-refund"
                value={formData.footer_refund_policy}
                onChange={(e) => update('footer_refund_policy', e.target.value)}
                placeholder="Your refund and cancellation policy..."
                rows={6}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="footer-privacy">Privacy Policy</Label>
              <Textarea
                id="footer-privacy"
                value={formData.footer_privacy_policy}
                onChange={(e) => update('footer_privacy_policy', e.target.value)}
                placeholder="Your privacy policy..."
                rows={6}
                disabled={isPending}
              />
            </div>
          </TabsContent>

          {/* ------------------------------ Theme ------------------------------ */}
          <TabsContent value="theme" className="mt-4 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="footer-copyright">Copyright Text</Label>
              <Input
                id="footer-copyright"
                value={formData.footer_copyright_text}
                onChange={(e) => update('footer_copyright_text', e.target.value)}
                placeholder="© 2026 Your Business. All rights reserved."
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to auto-generate from the business name and current year.
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="footer-show-powered-by">Show &quot;Powered by&quot;</Label>
                <p className="text-sm text-muted-foreground">
                  Display the powered-by credit in the footer bottom row.
                </p>
              </div>
              <Switch
                id="footer-show-powered-by"
                checked={formData.footer_show_powered_by}
                onCheckedChange={(checked) => update('footer_show_powered_by', checked)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="footer-powered-by-text">Powered-by Text</Label>
              <Input
                id="footer-powered-by-text"
                value={formData.footer_powered_by_text}
                onChange={(e) => update('footer_powered_by_text', e.target.value)}
                placeholder="Powered by WebNegosyo"
                disabled={isPending}
              />
            </div>

            <Separator />

            <div className="space-y-1">
              <Label>Colors</Label>
              <p className="text-xs text-muted-foreground">
                Leave a color empty to inherit it from the selected theme.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {COLOR_FIELDS.map((field) => {
                const value = formData[field.key] as string
                return (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <div className="flex gap-2">
                      <Input
                        id={field.key}
                        type="color"
                        value={value || '#ffffff'}
                        onChange={(e) => update(field.key, e.target.value)}
                        className="h-10 w-20"
                        disabled={isPending}
                      />
                      <Input
                        value={value}
                        onChange={(e) => update(field.key, e.target.value)}
                        placeholder="Inherit"
                        disabled={isPending}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>

        <Separator />

        {/* ----------------------------- Live Preview ---------------------------- */}
        <div className="space-y-2">
          <Label>Live Preview</Label>
          <div className="overflow-hidden rounded-lg border">
            <FooterView config={previewConfig} interactive={false} />
          </div>
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Footer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
