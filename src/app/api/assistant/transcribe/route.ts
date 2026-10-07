import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { resolveAssistantAccess } from '@/lib/assistant/access'
import { MAX_INPUT_CHARS, MAX_VOICE_BYTES } from '@/lib/assistant/limits'
import { isVoiceAudioType, transcribeVoice } from '@/lib/assistant/transcribe'
import { withRequestBearer } from '@/lib/supabase/bearer-session'

/**
 * POST /api/assistant/transcribe — one voice clip in (multipart: `tenantId`,
 * `audio`), its transcript out. The text lands in the Owl's composer for the
 * owner to check; it is never sent to the model from here.
 *
 * Same access as the chat (cookie session on the web, Bearer token from the
 * merchant app); its own per-person limits, since a clip costs no chat turn.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VOICE_BURST_LIMIT = { limit: 10, windowSec: 60 } as const
const VOICE_DAILY_LIMIT = { limit: 200, windowSec: 86_400 } as const

const tenantSchema = z.string().uuid()
const NO_STORE = { 'Cache-Control': 'private, no-store' }

function fail(status: number, error: string, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...headers } })
}

export function POST(request: NextRequest): Promise<Response> {
  return withRequestBearer(request, () => handleTranscribe(request))
}

async function handleTranscribe(request: NextRequest): Promise<Response> {
  const form = await request.formData().catch(() => null)
  const tenantId = tenantSchema.safeParse(form?.get('tenantId'))
  const audio = form?.get('audio')
  if (!tenantId.success || !(audio instanceof Blob)) return fail(400, 'That recording could not be sent.')
  if (audio.size === 0) return fail(400, 'That recording was empty. Try again.')
  if (audio.size > MAX_VOICE_BYTES) return fail(413, 'That recording is too long. Keep it under a minute.')
  if (!isVoiceAudioType(audio.type)) return fail(400, 'That recording format isn’t supported.')

  const access = await resolveAssistantAccess(tenantId.data)
  if (!access.ok) return fail(access.status, access.error)
  const { userId } = access.caller

  for (const [key, limit] of [
    [`assistant-voice:${userId}`, VOICE_BURST_LIMIT],
    [`assistant-voice-day:${userId}`, VOICE_DAILY_LIMIT],
  ] as const) {
    const verdict = await checkRateLimit(key, { ...limit, onRedisFailure: 'instance' })
    if (!verdict.allowed) {
      return fail(429, 'You’re recording quickly — give it a moment.', { 'Retry-After': String(verdict.retryAfterSec) })
    }
  }

  const filename = audio instanceof File && audio.name ? audio.name : 'voice.webm'
  const result = await transcribeVoice(audio, filename)
  if (!result.ok) {
    return result.reason === 'unconfigured'
      ? fail(503, 'Voice input isn’t set up yet. Please type your message.')
      : fail(502, 'Couldn’t turn that into text. Please try again.')
  }
  if (!result.text) return fail(422, 'I didn’t catch that. Try speaking a little closer.')

  return NextResponse.json({ text: result.text.slice(0, MAX_INPUT_CHARS) }, { headers: NO_STORE })
}
