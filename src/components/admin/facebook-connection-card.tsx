'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getFacebookPagesAction, disconnectFacebookPageAction, subscribePageToWebhookAction, verifyWebhookSubscriptionAction } from '@/actions/facebook'
import { toast } from 'sonner'
import { Facebook, MessageCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { Tenant } from '@/types/database'
import { FacebookPageSelector } from './facebook-page-selector'

interface FacebookPage {
  id: string
  page_id: string
  page_name: string
  is_active: boolean
  created_at: string
}

interface FacebookConnectionCardProps {
  tenant: Tenant
}

export function FacebookConnectionCard({ tenant }: FacebookConnectionCardProps) {
  const router = useRouter()
  const [pages, setPages] = useState<FacebookPage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [showPageSelector, setShowPageSelector] = useState(false)
  const [tempId, setTempId] = useState<string | null>(null)
  const [webhookStatuses, setWebhookStatuses] = useState<Record<string, { subscribed: boolean; subscribedFields?: string[] }>>({})
  const [checkingWebhook, setCheckingWebhook] = useState<string | null>(null)
  const [subscribingWebhook, setSubscribingWebhook] = useState<string | null>(null)

  // Check if we're in connection flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('facebook_connect') === 'true') {
      const temp = params.get('temp_id')
      if (temp) {
        setTempId(temp)
        setShowPageSelector(true)
      }
    }
  }, [])

  // Load connected pages
  useEffect(() => {
    loadPages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id])

  async function loadPages() {
    setIsLoading(true)
    try {
      const result = await getFacebookPagesAction(tenant.id)
      if (result.success && result.data) {
        setPages(result.data)
      } else {
        console.error('Failed to load pages:', result.error)
      }
    } catch (error) {
      console.error('Error loading pages:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleConnect() {
    setIsConnecting(true)
    try {
      // Redirect to OAuth initiation
      window.location.href = `/api/auth/facebook?tenant_id=${tenant.id}`
    } catch (error) {
      console.error('Error initiating connection:', error)
      toast.error('Failed to start Facebook connection')
      setIsConnecting(false)
    }
  }

  async function handleDisconnect(pageId: string) {
    try {
      const result = await disconnectFacebookPageAction(tenant.id, pageId)
      if (result.success) {
        toast.success('Facebook page disconnected')
        await loadPages()
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to disconnect page')
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
      toast.error('Failed to disconnect page')
    }
  }

  async function handlePageSelected(pageId: string, pageName: string, pageAccessToken: string, userAccessToken: string) {
    try {
      const response = await fetch('/api/auth/facebook/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant.id,
          page_id: pageId,
          page_name: pageName,
          page_access_token: pageAccessToken,
          user_access_token: userAccessToken,
          temp_id: tempId,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`Connected to ${pageName}`)
        setShowPageSelector(false)
        setTempId(null)
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname)
        await loadPages()
        router.refresh()
      } else {
        toast.error(data.error || 'Failed to connect page')
      }
    } catch (error) {
      console.error('Error connecting page:', error)
      toast.error('Failed to connect page')
    }
  }

  async function checkWebhookStatus(pageId: string) {
    setCheckingWebhook(pageId)
    try {
      const result = await verifyWebhookSubscriptionAction(tenant.id, pageId)
      if (result.success && result.data) {
        setWebhookStatuses((prev) => ({
          ...prev,
          [pageId]: {
            subscribed: result.data!.subscribed,
            subscribedFields: result.data!.subscribedFields,
          },
        }))
        if (result.data.subscribed) {
          toast.success('Page is subscribed to webhook')
        } else {
          toast.warning('Page is not subscribed to webhook. Click "Subscribe to Webhook" to enable.')
        }
      } else {
        toast.error(result.error || 'Failed to check webhook status')
      }
    } catch (error) {
      console.error('Error checking webhook status:', error)
      toast.error('Failed to check webhook status')
    } finally {
      setCheckingWebhook(null)
    }
  }

  async function subscribeWebhook(pageId: string) {
    setSubscribingWebhook(pageId)
    try {
      const result = await subscribePageToWebhookAction(tenant.id, pageId)
      if (result.success) {
        toast.success('Page subscribed to webhook successfully')
        // Refresh status
        await checkWebhookStatus(pageId)
      } else {
        toast.error(result.error || 'Failed to subscribe page to webhook')
      }
    } catch (error) {
      console.error('Error subscribing webhook:', error)
      toast.error('Failed to subscribe page to webhook')
    } finally {
      setSubscribingWebhook(null)
    }
  }

  const activePages = pages.filter((p) => p.is_active)
  const primaryPage = activePages.find((p) => tenant.facebook_page_id === p.id) || activePages[0]

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Facebook className="h-5 w-5 text-blue-600" />
            Facebook Messenger Integration
          </CardTitle>
          <CardDescription>
            Connect your Facebook Page to receive order notifications directly in Messenger
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activePages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-dashed p-6 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  No Facebook Page connected. Connect your page to receive orders via Messenger.
                </p>
                <Button onClick={handleConnect} disabled={isConnecting}>
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Facebook className="mr-2 h-4 w-4" />
                      Connect Facebook Page
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Connected Pages</p>
                  <p className="text-xs text-muted-foreground">
                    {activePages.length} page{activePages.length !== 1 ? 's' : ''} connected
                  </p>
                </div>
                <Button onClick={handleConnect} variant="outline" size="sm" disabled={isConnecting}>
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Facebook className="mr-2 h-4 w-4" />
                      Add Page
                    </>
                  )}
                </Button>
              </div>

              <Separator />

              {activePages.map((page) => {
                const webhookStatus = webhookStatuses[page.id]
                const isSubscribed = webhookStatus?.subscribed
                return (
                  <div
                    key={page.id}
                    className="rounded-lg border p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {primaryPage?.id === page.id ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <MessageCircle className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{page.page_name}</p>
                            {primaryPage?.id === page.id && (
                              <Badge variant="outline" className="text-xs">
                                Primary
                              </Badge>
                            )}
                            {webhookStatus && (
                              <Badge
                                variant="outline"
                                className={
                                  isSubscribed
                                    ? 'bg-green-50 text-green-700 text-xs'
                                    : 'bg-yellow-50 text-yellow-700 text-xs'
                                }
                              >
                                {isSubscribed ? 'Webhook ✓' : 'Webhook ✗'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Page ID: {page.page_id}</p>
                          {webhookStatus && !isSubscribed && webhookStatus.subscribedFields && (
                            <p className="text-xs text-yellow-600 mt-1">
                              Missing: {['messages', 'messaging_postbacks', 'messaging_referrals']
                                .filter((f) => !webhookStatus.subscribedFields?.includes(f))
                                .join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => checkWebhookStatus(page.id)}
                        disabled={checkingWebhook === page.id}
                      >
                        {checkingWebhook === page.id ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Checking...
                          </>
                        ) : (
                          'Check Webhook'
                        )}
                      </Button>
                      {webhookStatus && !isSubscribed && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => subscribeWebhook(page.id)}
                          disabled={subscribingWebhook === page.id}
                        >
                          {subscribingWebhook === page.id ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Subscribing...
                            </>
                          ) : (
                            'Subscribe Webhook'
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisconnect(page.page_id)}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                )
              })}

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <p className="text-sm text-blue-900">
                  <strong>How it works:</strong> When customers complete an order, they&apos;ll be
                  redirected to Messenger. Your page will automatically receive a formatted message
                  with all order details.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showPageSelector && tempId && (
        <FacebookPageSelector
          tenantId={tenant.id}
          tempId={tempId}
          onPageSelected={handlePageSelected}
          onClose={() => {
            setShowPageSelector(false)
            setTempId(null)
            window.history.replaceState({}, '', window.location.pathname)
          }}
        />
      )}
    </>
  )
}

