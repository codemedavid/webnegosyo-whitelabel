/**
 * POST /api/app-builds/eas-webhook — EAS says a build or submission completed.
 *
 * One EAS project webhook per event (BUILD, SUBMIT), signed with
 * `expo-signature: sha1=<hmac>` over the raw body using EAS_WEBHOOK_SECRET
 * (`verifyEasSignature`). Events for builds we don't know (other projects'
 * builds, builds started by hand) and replays answer 200: EAS retries every
 * non-2xx, and nothing is changed for them.
 */
import { NextResponse } from 'next/server'
import { defineRoute } from '@/platform/http/define-route'
import { easWebhookBodySchema, readEasEvent, verifyEasSignature } from '@/lib/app-builds/eas-webhook'
import { appBuildsDb, applyEasEvent } from '@/lib/app-builds/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineRoute({
  auth: {
    kind: 'signature',
    scheme: 'expo-signature (HMAC-SHA1, EAS_WEBHOOK_SECRET)',
    verify: (request, rawBody) => verifyEasSignature(rawBody, request.headers.get('expo-signature'), process.env.EAS_WEBHOOK_SECRET?.trim()),
  },
  rateLimit: { bucket: 'app-build-eas-webhook', per: 'ip', max: 300, window: '1m', onRedisFailure: 'instance' },
  body: easWebhookBodySchema,
  handler: async ({ body }) => {
    const event = readEasEvent(body)
    const outcome = await applyEasEvent(appBuildsDb(), event)
    if (outcome === 'unknown-build') console.warn('[app-builds] EAS event for an unknown build', { kind: event.kind })
    return NextResponse.json({ ok: true, outcome })
  },
})
