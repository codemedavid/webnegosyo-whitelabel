/**
 * Facebook Messenger API Functions
 * Handles all communication with Facebook Graph API
 */

import type { FacebookApiResponse } from '@/types/messenger'
import { getPageTokenForTenant } from './token'

const FACEBOOK_API = 'https://graph.facebook.com/v18.0'

/**
 * Base function to send any message type to Facebook API
 * Uses tenant-specific token if available, otherwise falls back to global token
 */
async function sendMessage(psid: string, tenantId: string, message: unknown): Promise<FacebookApiResponse> {
  // Get tenant-specific token with fallback to global token
  const pageToken = await getPageTokenForTenant(tenantId)

  if (!pageToken) {
    throw new Error('Facebook Page Access Token not configured. Please configure your token in Settings.')
  }

  const response = await fetch(
    `${FACEBOOK_API}/me/messages?access_token=${pageToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: psid },
        message,
      }),
    }
  )

  const data = await response.json() as FacebookApiResponse

  if (!response.ok || data.error) {
    console.error('Facebook API error:', data.error || data)
    throw new Error(
      data.error?.message || `Facebook API error: ${response.statusText}`
    )
  }

  return data
}

/**
 * Send plain text message
 */
export async function sendText(psid: string, tenantId: string, text: string): Promise<void> {
  try {
    await sendMessage(psid, tenantId, { text })
  } catch (error) {
    console.error('Error sending text message:', error)
    throw error
  }
}

/**
 * Send Generic Template (for menu items)
 * Max 10 elements
 */
export async function sendGenericTemplate(
  psid: string,
  tenantId: string,
  elements: Array<{
    title: string
    subtitle?: string
    image_url?: string
    buttons: Array<{
      type: 'postback' | 'web_url'
      title: string
      payload?: string
      url?: string
    }>
  }>
): Promise<void> {
  try {
    await sendMessage(psid, tenantId, {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: elements.slice(0, 10), // Max 10 elements
        },
      },
    })
  } catch (error) {
    console.error('Error sending generic template:', error)
    throw error
  }
}

/**
 * Send Button Template
 * Max 3 buttons
 */
export async function sendButtonTemplate(
  psid: string,
  tenantId: string,
  text: string,
  buttons: Array<{
    type: 'postback' | 'web_url'
    title: string
    payload?: string
    url?: string
  }>
): Promise<void> {
  try {
    await sendMessage(psid, tenantId, {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text,
          buttons: buttons.slice(0, 3), // Max 3 buttons
        },
      },
    })
  } catch (error) {
    console.error('Error sending button template:', error)
    throw error
  }
}

/**
 * Send Quick Replies
 * Max 13 quick replies
 */
export async function sendQuickReplies(
  psid: string,
  tenantId: string,
  text: string,
  quickReplies: Array<{
    content_type: 'text'
    title: string
    payload: string
  }>
): Promise<void> {
  try {
    await sendMessage(psid, tenantId, {
      text,
      quick_replies: quickReplies.slice(0, 13), // Max 13 quick replies
    })
  } catch (error) {
    console.error('Error sending quick replies:', error)
    throw error
  }
}

/**
 * Send image attachment
 */
export async function sendImage(psid: string, tenantId: string, imageUrl: string): Promise<void> {
  try {
    await sendMessage(psid, tenantId, {
      attachment: {
        type: 'image',
        payload: {
          url: imageUrl,
        },
      },
    })
  } catch (error) {
    console.error('Error sending image:', error)
    throw error
  }
}

