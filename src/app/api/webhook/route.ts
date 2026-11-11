import { after, NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/facebook-api'
import { createLogger } from '@/lib/logger'
import { parseWebhookBody } from '@/lib/messenger/events'
import { handleEvent } from '@/lib/messenger/handle-event'
import { createWebhookDeps } from '@/lib/messenger/webhook-deps'

// Tracing is opt-in (DEBUG_MESSENGER): these lines carry PSIDs.
const log = createLogger('[Webhook]', 'DEBUG_MESSENGER')

/** The work after the 200 (a reply can be several Send API calls). */
export const maxDuration = 30

/**
 * GET /api/webhook
 * Meta's verification handshake when the webhook URL is registered.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN
  if (!verifyToken) {
    console.error('[Webhook] FACEBOOK_VERIFY_TOKEN not configured')
    return new NextResponse('Verify token not configured', { status: 500 })
  }
  if (mode === 'subscribe' && token === verifyToken) {
    log.debug('Verification successful')
    return new NextResponse(challenge, { status: 200 })
  }
  console.error('[Webhook] Verification failed', { mode, tokenProvided: !!token })
  return new NextResponse('Forbidden', { status: 403 })
}

/**
 * POST /api/webhook
 * Messenger events for every connected Page.
 *
 * Meta wants a 200 within 5 seconds and, after an hour of failures, turns the
 * subscription off. So: verify the signature (fail closed), answer 200, and do
 * the work after the response (`after`). Each event is handled once
 * (`dedupe.ts`) and on its own: one failing event never stops the rest.
 * The decisions live in `src/lib/messenger/handle-event.ts`.
 */
export async function POST(request: NextRequest) {
  const bodyText = await request.text()
  if (!bodyText) return new NextResponse('Empty body', { status: 400 })

  if (!process.env.FACEBOOK_APP_SECRET) {
    console.error('[Webhook] FACEBOOK_APP_SECRET not configured - rejecting request')
    return new NextResponse('Server configuration error', { status: 500 })
  }
  const signature = request.headers.get('x-hub-signature-256')
  if (!signature) return new NextResponse('Missing signature', { status: 403 })
  if (!verifyWebhookSignature(bodyText, signature)) {
    console.error('[Webhook] Invalid signature - rejecting request')
    return new NextResponse('Invalid signature', { status: 403 })
  }

  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  const events = parseWebhookBody(body)
  if (events === null) return new NextResponse('Not Found', { status: 404 })
  if (events.length === 0) return new NextResponse('OK', { status: 200 })

  after(async () => {
    const deps = createWebhookDeps()
    for (const event of events) {
      try {
        const outcome = await handleEvent(event, deps)
        log.debug('event handled', { kind: event.kind, outcome })
      } catch (error) {
        console.error('[Webhook] event failed', { kind: event.kind, message: error instanceof Error ? error.message : String(error) })
      }
    }
  })

  return new NextResponse('OK', { status: 200 })
}
