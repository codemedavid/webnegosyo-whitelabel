/**
 * Facebook Graph API Utilities
 * Handles OAuth, page management, and messaging via Facebook Graph API
 */

import { createHmac } from 'crypto'

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v20.0'

interface FacebookPage {
  id: string
  name: string
  access_token: string
}

interface FacebookTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

interface FacebookLongLivedTokenResponse {
  access_token: string
  expires_in: number
}

/**
 * Exchange OAuth code for user access token
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<string> {
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET

  if (!appId || !appSecret) {
    throw new Error('Facebook App ID and App Secret must be configured')
  }

  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/oauth/access_token?` +
    `client_id=${appId}` +
    `&client_secret=${appSecret}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${code}`,
    { method: 'GET' }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to exchange code for token: ${error}`)
  }

  const data = (await response.json()) as FacebookTokenResponse
  return data.access_token
}

/**
 * Exchange short-lived token for long-lived token (60 days)
 */
export async function getLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET

  if (!appId || !appSecret) {
    throw new Error('Facebook App ID and App Secret must be configured')
  }

  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/oauth/access_token?` +
    `grant_type=fb_exchange_token` +
    `&client_id=${appId}` +
    `&client_secret=${appSecret}` +
    `&fb_exchange_token=${shortLivedToken}`,
    { method: 'GET' }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get long-lived token: ${error}`)
  }

  const data = (await response.json()) as FacebookLongLivedTokenResponse
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
  }
}

/**
 * Get user's Facebook Pages
 */
export async function getUserPages(accessToken: string): Promise<FacebookPage[]> {
  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/me/accounts?access_token=${accessToken}`,
    { method: 'GET' }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get user pages: ${error}`)
  }

  const data = (await response.json()) as { data: FacebookPage[] }
  return data.data || []
}

/**
 * Subscribe a page to webhook
 * Subscribes to: messages, messaging_postbacks, messaging_referrals
 */
export async function subscribePageToWebhook(
  pageId: string,
  pageAccessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Explicitly subscribe to all required webhook fields
    // messaging_referrals is CRITICAL for receiving ref parameter events
    // message_echoes enables admin-triggered menu cards
    const subscribedFields = [
      'messages',              // Regular messages from users
      'messaging_postbacks',   // Button clicks, quick replies
      'messaging_referrals',   // Referral events (when user clicks link with ref parameter)
      'message_echoes',        // Echo events (when admin/page sends a message)
    ].join(',')

    const url = `${FACEBOOK_GRAPH_API}/${pageId}/subscribed_apps?` +
      `subscribed_fields=${subscribedFields}` +
      `&access_token=${pageAccessToken}`

    console.log(`[Facebook API] Subscribing page ${pageId} to webhook with fields: ${subscribedFields}`)

    const response = await fetch(url, { method: 'POST' })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Facebook API] Failed to subscribe page ${pageId} to webhook:`, errorText)
      console.error(`[Facebook API] URL used: ${url.replace(pageAccessToken, 'REDACTED')}`)
      return { success: false, error: errorText }
    }

    const data = (await response.json()) as { success: boolean }

    if (data.success) {
      console.log(`[Facebook API] ✅ Successfully subscribed page ${pageId} to webhook`)
      console.log(`[Facebook API] Subscribed fields: ${subscribedFields}`)
      console.log(`[Facebook API] ⚠️ IMPORTANT: messaging_referrals is required for order tracking via ref parameter`)
    } else {
      console.warn(`[Facebook API] ⚠️ Subscription response for page ${pageId} was not successful`)
      console.warn(`[Facebook API] Response data:`, JSON.stringify(data, null, 2))
    }

    return { success: data.success === true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Facebook API] Exception subscribing page ${pageId} to webhook:`, errorMessage)
    return { success: false, error: errorMessage }
  }
}

/**
 * Verify if a page is subscribed to webhook
 */
export async function verifyPageWebhookSubscription(
  pageId: string,
  pageAccessToken: string
): Promise<{ subscribed: boolean; subscribedFields?: string[] }> {
  try {
    const response = await fetch(
      `${FACEBOOK_GRAPH_API}/${pageId}/subscribed_apps?access_token=${pageAccessToken}`,
      { method: 'GET' }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Facebook API] Failed to verify subscription for page ${pageId}:`, errorText)
      return { subscribed: false }
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string
        subscribed_fields: string[]
      }>
    }

    const appId = process.env.FACEBOOK_APP_ID
    if (!appId) {
      return { subscribed: false }
    }

    const subscription = data.data?.find((sub) => sub.id === appId)

    if (subscription) {
      const requiredFields = ['messages', 'messaging_postbacks', 'messaging_referrals', 'message_echoes']
      const hasAllFields = requiredFields.every((field) =>
        subscription.subscribed_fields.includes(field)
      )

      const missingFields = requiredFields.filter(
        (field) => !subscription.subscribed_fields.includes(field)
      )

      if (missingFields.length > 0) {
        console.warn(`[Facebook API] Page ${pageId} missing required webhook fields:`, missingFields)
        console.warn(`[Facebook API] Current subscribed fields:`, subscription.subscribed_fields)
        if (missingFields.includes('messaging_referrals')) {
          console.error(`[Facebook API] ⚠️ CRITICAL: messaging_referrals is missing! Order tracking via ref parameter will not work.`)
        }
      } else {
        console.log(`[Facebook API] ✅ Page ${pageId} has all required webhook fields subscribed`)
      }

      return {
        subscribed: hasAllFields,
        subscribedFields: subscription.subscribed_fields,
      }
    }

    return { subscribed: false }
  } catch (error) {
    console.error(`[Facebook API] Exception verifying subscription for page ${pageId}:`, error)
    return { subscribed: false }
  }
}

/**
 * Unsubscribe a page from webhook
 */
export async function unsubscribePageFromWebhook(
  pageId: string,
  pageAccessToken: string
): Promise<boolean> {
  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/${pageId}/subscribed_apps?` +
    `access_token=${pageAccessToken}`,
    { method: 'DELETE' }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to unsubscribe page from webhook: ${error}`)
    return false
  }

  const data = (await response.json()) as { success: boolean }
  return data.success === true
}

/**
 * Send a message via Messenger
 */
export async function sendMessage(
  psid: string,
  pageAccessToken: string,
  message: string
): Promise<boolean> {
  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/me/messages?access_token=${pageAccessToken}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text: message },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to send message: ${error}`)
    return false
  }

  const data = (await response.json()) as { recipient_id?: string; message_id?: string }
  return !!data.message_id
}

/**
 * Send a menu card via Messenger using Generic Template
 * Used for auto-reply when customers ask about menu/products
 */
export async function sendMenuCard(
  psid: string,
  pageAccessToken: string,
  tenant: {
    name: string
    logo_url?: string | null
    domain?: string | null
    slug: string
  }
): Promise<boolean> {
  // Construct the tenant's website URL with PSID for tracking
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN || 'webnegosyo.app'
  let baseUrl: string

  if (tenant.domain) {
    // Use custom domain if set
    baseUrl = tenant.domain.startsWith('http') ? tenant.domain : `https://${tenant.domain}`
  } else {
    // Use subdomain format
    baseUrl = `https://${tenant.slug}.${rootDomain}`
  }

  // Append PSID to URL for customer tracking
  const websiteUrl = `${baseUrl}?psid=${encodeURIComponent(psid)}`

  // Use a default image if no logo is set
  const imageUrl = tenant.logo_url || `https://${rootDomain}/default-menu-card.png`

  const payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [
            {
              title: tenant.name,
              image_url: imageUrl,
              subtitle: 'Browse our full menu and place your order online! 🍽️',
              default_action: {
                type: 'web_url',
                url: websiteUrl,
                webview_height_ratio: 'tall',
              },
              buttons: [
                {
                  type: 'web_url',
                  url: websiteUrl,
                  title: 'View Menu',
                },
              ],
            },
          ],
        },
      },
    },
  }

  try {
    const response = await fetch(
      `${FACEBOOK_GRAPH_API}/me/messages?access_token=${pageAccessToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error(`[Facebook API] Failed to send menu card: ${error}`)
      return false
    }

    const data = (await response.json()) as { recipient_id?: string; message_id?: string }
    console.log(`[Facebook API] ✅ Menu card sent successfully to ${psid}`)
    return !!data.message_id
  } catch (error) {
    console.error(`[Facebook API] Exception sending menu card:`, error)
    return false
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  body: string,
  signature: string
): boolean {
  const appSecret = process.env.FACEBOOK_APP_SECRET
  const isDevelopment = process.env.NODE_ENV === 'development'

  if (!appSecret) {
    if (isDevelopment) {
      console.warn('[Webhook] FACEBOOK_APP_SECRET not configured - allowing in development mode only')
      return true
    }
    console.error('[Webhook] FACEBOOK_APP_SECRET not configured - rejecting request in production')
    return false
  }

  if (!signature) {
    if (isDevelopment) {
      console.warn('[Webhook] No signature header present - allowing in development mode only')
      return true
    }
    console.error('[Webhook] No signature header present - rejecting request in production')
    return false
  }

  try {
    const expectedSignature = createHmac('sha256', appSecret)
      .update(body, 'utf8')
      .digest('hex')

    const expectedSignatureWithPrefix = `sha256=${expectedSignature}`

    // Use timing-safe comparison to prevent timing attacks
    if (signature.length !== expectedSignatureWithPrefix.length) {
      return false
    }

    // Simple timing-safe compare (constant time)
    let result = 0
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignatureWithPrefix.charCodeAt(i)
    }
    return result === 0
  } catch (error) {
    console.error('[Webhook] Error verifying signature:', error)
    return false
  }
}

