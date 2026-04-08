import { createHash } from 'crypto'

const META_GRAPH_API = 'https://graph.facebook.com/v20.0'

export interface MetaConversionUserData {
  email?: string
  phone?: string
  fbp?: string
  fbc?: string
  clientIpAddress?: string
  clientUserAgent?: string
}

export interface MetaConversionEventInput {
  eventName: 'Lead' | 'InitiateCheckout' | 'PageView' | 'ViewContent'
  eventId: string
  eventSourceUrl?: string
  actionSource?: 'website'
  userData?: MetaConversionUserData
  customData?: Record<string, unknown>
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  if (/^0\d{10}$/.test(digits)) {
    return `63${digits.slice(1)}`
  }

  if (/^63\d{10}$/.test(digits)) {
    return digits
  }

  return digits
}

function buildUserData(userData?: MetaConversionUserData) {
  if (!userData) return {}

  const payload: Record<string, unknown> = {}

  if (userData.email) {
    payload.em = [sha256(normalizeEmail(userData.email))]
  }

  if (userData.phone) {
    payload.ph = [sha256(normalizePhone(userData.phone))]
  }

  if (userData.fbp) {
    payload.fbp = userData.fbp
  }

  if (userData.fbc) {
    payload.fbc = userData.fbc
  }

  if (userData.clientIpAddress) {
    payload.client_ip_address = userData.clientIpAddress
  }

  if (userData.clientUserAgent) {
    payload.client_user_agent = userData.clientUserAgent
  }

  return payload
}

export async function sendMetaConversionEvent(input: MetaConversionEventInput) {
  const pixelId = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN
  const testEventCode = process.env.META_TEST_EVENT_CODE

  if (!pixelId || !accessToken) {
    return { sent: false, skipped: 'missing-meta-config' as const }
  }

  const body = {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: input.actionSource ?? 'website',
        event_source_url: input.eventSourceUrl,
        user_data: buildUserData(input.userData),
        custom_data: input.customData,
      },
    ],
    access_token: accessToken,
    test_event_code: testEventCode,
  }

  const response = await fetch(`${META_GRAPH_API}/${pixelId}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    console.error('[Meta CAPI] Failed to send conversion event', payload)
    return { sent: false, error: payload }
  }

  return { sent: true, data: payload }
}
