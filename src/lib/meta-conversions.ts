import { createHash } from 'crypto'

const META_GRAPH_API = 'https://graph.facebook.com/v24.0'

/**
 * Where the pixel and token come from. The token has lived under two names:
 * the code read META_CONVERSIONS_API_TOKEN while Vercel holds
 * META_CONVERSIONS_API_ACCESS_TOKEN, so until 2026-11-10 no server event was
 * ever sent. Both are accepted.
 *
 * The test event code routes events to Events Manager's "Test events" tab
 * only, where they count for nothing. It is set on Vercel for every
 * environment, so it is honoured everywhere EXCEPT production — otherwise
 * every real Lead and Purchase would land in the test tab.
 */
export function readMetaConversionsConfig(env: NodeJS.ProcessEnv = process.env) {
  const pixelId = env.META_PIXEL_ID || env.NEXT_PUBLIC_META_PIXEL_ID
  const accessToken = env.META_CONVERSIONS_API_TOKEN || env.META_CONVERSIONS_API_ACCESS_TOKEN
  const testEventCode = env.VERCEL_ENV === 'production' ? undefined : env.META_TEST_EVENT_CODE || undefined
  return { pixelId, accessToken, testEventCode }
}

export interface MetaConversionUserData {
  email?: string
  phone?: string
  fbp?: string
  fbc?: string
  clientIpAddress?: string
  clientUserAgent?: string
  /** Our own id for the person (a lead's reference number); hashed before it leaves. */
  externalId?: string
  /** ISO 3166-1 alpha-2, lowercase (`ph`); hashed before it leaves. */
  country?: string
}

export interface MetaConversionEventInput {
  eventName: 'Lead' | 'InitiateCheckout' | 'PageView' | 'ViewContent' | 'AddPaymentInfo' | 'Purchase'
  eventId: string
  /** Unix seconds; defaults to now. */
  eventTime?: number
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

  if (userData.externalId) {
    payload.external_id = [sha256(userData.externalId.trim())]
  }

  if (userData.country) {
    payload.country = [sha256(userData.country.trim().toLowerCase())]
  }

  return payload
}

export async function sendMetaConversionEvent(input: MetaConversionEventInput) {
  const { pixelId, accessToken, testEventCode } = readMetaConversionsConfig()

  if (!pixelId || !accessToken) {
    return { sent: false, skipped: 'missing-meta-config' as const }
  }

  const body = {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
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
    signal: AbortSignal.timeout(10_000),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    console.error('[Meta CAPI] Failed to send conversion event', payload)
    return { sent: false, error: payload }
  }

  return { sent: true, data: payload }
}
