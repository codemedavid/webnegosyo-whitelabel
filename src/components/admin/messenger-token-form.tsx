'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { updateTenantBrandingForAdminAction } from '@/actions/tenants'
import { toast } from 'sonner'
import type { Tenant } from '@/types/database'

interface MessengerTokenFormProps {
  tenant: Tenant
}

export function MessengerTokenForm({ tenant }: MessengerTokenFormProps) {
  const router = useRouter()
  const [token, setToken] = useState(tenant.messenger_page_access_token || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const input = {
        primary_color: tenant.primary_color,
        secondary_color: tenant.secondary_color,
        accent_color: tenant.accent_color || '',
        background_color: tenant.background_color || '',
        header_color: tenant.header_color || '',
        header_font_color: tenant.header_font_color || '',
        cards_color: tenant.cards_color || '',
        cards_border_color: tenant.cards_border_color || '',
        card_title_color: tenant.card_title_color || '',
        card_price_color: tenant.card_price_color || '',
        card_description_color: tenant.card_description_color || '',
        modal_background_color: tenant.modal_background_color || '',
        modal_title_color: tenant.modal_title_color || '',
        modal_price_color: tenant.modal_price_color || '',
        modal_description_color: tenant.modal_description_color || '',
        button_primary_color: tenant.button_primary_color || '',
        button_primary_text_color: tenant.button_primary_text_color || '',
        button_secondary_color: tenant.button_secondary_color || '',
        button_secondary_text_color: tenant.button_secondary_text_color || '',
        text_primary_color: tenant.text_primary_color || '',
        text_secondary_color: tenant.text_secondary_color || '',
        text_muted_color: tenant.text_muted_color || '',
        border_color: tenant.border_color || '',
        success_color: tenant.success_color || '',
        warning_color: tenant.warning_color || '',
        error_color: tenant.error_color || '',
        link_color: tenant.link_color || '',
        shadow_color: tenant.shadow_color || '',
        messenger_page_access_token: token,
      }

      const result = await updateTenantBrandingForAdminAction(tenant.id, input)

      if (result.success) {
        toast.success('Token saved successfully!')
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to save token. Please try again.')
      }
    } catch (error) {
      console.error('Error saving token:', error)
      toast.error(error instanceof Error ? error.message : 'An error occurred while saving the token.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messenger Integration</CardTitle>
        <CardDescription>Configure your Facebook Messenger bot integration</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
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
          <div>
            <p className="text-sm font-medium">Status</p>
            <p className="text-sm text-muted-foreground">
              {token.trim() ? (
                <span className="text-green-600">✅ Token configured</span>
              ) : (
                <span className="text-orange-600">⚠️ Using global token</span>
              )}
            </p>
          </div>
        </div>

        <Separator />

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="messenger_page_access_token">
                Facebook Page Access Token
              </Label>
              <Input
                id="messenger_page_access_token"
                name="messenger_page_access_token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono text-sm"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Enter your Facebook Page Access Token to connect your own Facebook page.
                <br />
                Leave empty to use the global token.
                <br />
                <a
                  href="https://developers.facebook.com/docs/messenger-platform/getting-started/app-setup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Learn how to get your Page Access Token
                </a>
              </p>
            </div>

            <div className="pt-2">
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : '💾 Save Token'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

