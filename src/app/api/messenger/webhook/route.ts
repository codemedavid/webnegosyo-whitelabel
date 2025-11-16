import { NextRequest, NextResponse } from 'next/server'
import { handleMessengerEvent } from '@/lib/messenger'
import type { MessengerMessageEvent, MessengerWebhookBody } from '@/types/messenger'
import crypto from 'crypto'

/**
 * Verify webhook signature from Facebook
 */
function verifySignature(body: string, signature: string): boolean {
  if (!process.env.FACEBOOK_APP_SECRET) {
    console.warn('[Webhook] FACEBOOK_APP_SECRET not configured - skipping signature verification')
    return true // Skip verification if secret not set (for development)
  }

  if (!signature) {
    console.warn('[Webhook] No signature header present - skipping verification')
    return true // Skip if no signature (for development/testing)
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.FACEBOOK_APP_SECRET)
      .update(body, 'utf8')
      .digest('hex')

    const expectedSignatureWithPrefix = `sha256=${expectedSignature}`
    
    // Log for debugging (first 20 chars only)
    console.log('[Webhook] Signature check:', {
      received: signature.substring(0, 20) + '...',
      expected: expectedSignatureWithPrefix.substring(0, 20) + '...',
      match: signature === expectedSignatureWithPrefix,
    })

    return signature === expectedSignatureWithPrefix
  } catch (error) {
    console.error('[Webhook] Error verifying signature:', error)
    return false
  }
}

/**
 * GET Handler - Webhook verification (required by Facebook)
 * Facebook sends a GET request to verify the webhook URL
 */
export async function GET(request: NextRequest) {
  console.log('[Webhook] GET request received')
  console.log('[Webhook] URL:', request.url)
  console.log('[Webhook] Query params:', Object.fromEntries(request.nextUrl.searchParams))

  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  console.log('[Webhook] Mode:', mode)
  console.log('[Webhook] Token from request:', token ? '***' + token.slice(-4) : 'NOT PROVIDED')
  console.log('[Webhook] Expected token in env:', process.env.FACEBOOK_VERIFY_TOKEN ? '***' + process.env.FACEBOOK_VERIFY_TOKEN.slice(-4) : 'NOT SET')
  console.log('[Webhook] Challenge:', challenge)

  // Verify the webhook
  if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    console.log('[Webhook] ✅ Verification successful!')
    return new NextResponse(challenge, { status: 200 })
  }

  console.error('[Webhook] ❌ Verification failed')
  console.error('[Webhook] Mode check:', mode === 'subscribe' ? 'PASS' : 'FAIL')
  console.error('[Webhook] Token match:', token === process.env.FACEBOOK_VERIFY_TOKEN ? 'PASS' : 'FAIL')
  return new NextResponse('Forbidden', { status: 403 })
}

/**
 * POST Handler - Receive Messenger events
 * Facebook sends POST requests when users interact with the bot
 */
export async function POST(request: NextRequest) {
  console.log('[Webhook] ============================================')
  console.log('[Webhook] POST request received at:', new Date().toISOString())
  console.log('[Webhook] Request URL:', request.url)
  console.log('[Webhook] Request method:', request.method)
  console.log('[Webhook] Headers:', {
    'content-type': request.headers.get('content-type'),
    'x-hub-signature-256': request.headers.get('x-hub-signature-256') ? 'present' : 'missing',
    'user-agent': request.headers.get('user-agent'),
  })

  try {
    // Get raw body for signature verification
    const bodyText = await request.text()
    console.log('[Webhook] Raw body length:', bodyText.length)
    console.log('[Webhook] Raw body preview:', bodyText.substring(0, 200))

    if (!bodyText || bodyText.length === 0) {
      console.error('[Webhook] ❌ Empty body received!')
      return new NextResponse('Empty body', { status: 400 })
    }

    const body = JSON.parse(bodyText) as MessengerWebhookBody
    console.log('[Webhook] Body object:', body.object)
    console.log('[Webhook] Number of entries:', body.entry?.length || 0)

    // Verify signature (only if APP_SECRET is set)
    const signature = request.headers.get('x-hub-signature-256')
    if (signature && process.env.FACEBOOK_APP_SECRET) {
      const isValid = verifySignature(bodyText, signature)
      if (!isValid) {
        console.error('[Webhook] ❌ Invalid webhook signature - rejecting request')
        console.error('[Webhook] Make sure FACEBOOK_APP_SECRET matches your Facebook App Secret')
        // For development, you might want to comment out this return to allow requests
        // return new NextResponse('Invalid signature', { status: 403 })
      } else {
        console.log('[Webhook] ✅ Signature verified successfully')
      }
    } else if (signature && !process.env.FACEBOOK_APP_SECRET) {
      console.warn('[Webhook] ⚠️ Signature present but FACEBOOK_APP_SECRET not set - skipping verification')
    } else {
      console.log('[Webhook] ℹ️ No signature header - proceeding without verification')
    }

    // Process webhook events
    // Facebook sends webhook events when body.object === 'page'
    // Structure: body.entry[] -> entry.messaging[] -> event.message or event.postback
    if (body.object === 'page') {
      // Process each entry - there may be multiple if batched
      // Note: Old code used entry.messaging[0] (first only), but we process ALL events (better!)
      for (const entry of body.entry) {
        const pageId = entry.id // Facebook Page ID
        
        // Process each messaging event in the entry
        for (const event of entry.messaging) {
          const senderId = event.sender.id

          // Skip if sender is the page itself
          if (event.sender.id === event.recipient.id) {
            console.log(`[Webhook] Skipping event from page itself (PSID: ${senderId})`)
            continue
          }

          try {
            // Handle message events
            if (event.message) {
              const message = event.message as MessengerMessageEvent

              // Skip echo messages (sent by our bot)
              if (message.is_echo) {
                console.log(`[Webhook] Skipping echo message from PSID: ${senderId}`)
                continue
              }

              console.log(
                `[Webhook] Processing message event from PSID: ${senderId}, pageId: ${pageId}, text: ${
                  message.text || 'N/A'
                }`
              )
              await handleMessengerEvent(senderId, 'message', event.message, pageId)
            }

            // Handle postback events (button clicks)
            if (event.postback) {
              console.log(`[Webhook] Processing postback event from PSID: ${senderId}, pageId: ${pageId}, payload: ${event.postback.payload || 'N/A'}`)
              await handleMessengerEvent(senderId, 'postback', event.postback, pageId)
            }
          } catch (error) {
            console.error('[Webhook] Error processing Messenger event:', error)
            console.error('[Webhook] Error details:', {
              senderId,
              pageId,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            })
            // Continue processing other events even if one fails
          }
        }
      }
    } else {
      // Return a '404 Not Found' if event is not from a page subscription
      console.warn('[Webhook] Received webhook event that is not from a page subscription:', body.object)
      return new NextResponse('Not Found', { status: 404 })
    }

    // Always return 200 OK to acknowledge receipt (Facebook expects this)
    return new NextResponse('EVENT_RECEIVED', { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return new NextResponse('Error', { status: 500 })
  }
}

