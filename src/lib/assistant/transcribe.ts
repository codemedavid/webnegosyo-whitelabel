/**
 * Voice → text for the Owl, via Whisper on OpenRouter's OpenAI-compatible
 * /audio/transcriptions endpoint — the same key as every other AI feature.
 *
 * Only the transcript leaves this module: the audio is forwarded once and
 * never stored. The owner reviews the text in the composer before sending,
 * so a mis-heard word is fixed by hand rather than acted on.
 */

import 'server-only'

const OPENROUTER_TRANSCRIPTIONS_URL = 'https://openrouter.ai/api/v1/audio/transcriptions'
const DEFAULT_MODEL = 'openai/whisper-large-v3'
const TRANSCRIBE_TIMEOUT_MS = 30_000

/** Containers Whisper decodes. Browsers label webm/mp4 recordings `video/*` at times. */
const ACCEPTED_TYPES = new Set(['video/webm', 'video/mp4'])

export function isVoiceAudioType(type: string): boolean {
  const base = type.split(';')[0].trim().toLowerCase()
  return base.startsWith('audio/') || ACCEPTED_TYPES.has(base)
}

export function transcriptionModel(): string {
  return process.env.ASSISTANT_TRANSCRIBE_MODEL?.trim() || DEFAULT_MODEL
}

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'unconfigured' | 'failed' }

export async function transcribeVoice(audio: Blob, filename: string): Promise<TranscribeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) return { ok: false, reason: 'unconfigured' }

  // No `prompt`: OpenRouter ignores Whisper's vocabulary hint on multipart
  // requests, and the language is left to auto-detect so Taglish isn't forced.
  const form = new FormData()
  form.append('file', audio, filename)
  form.append('model', transcriptionModel())
  form.append('response_format', 'json')
  form.append('temperature', '0')

  try {
    const response = await fetch(OPENROUTER_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://www.webnegosyo.com',
        'X-Title': 'WebNegosyo Owl',
      },
      body: form,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error('[assistant] transcription refused', { status: response.status, detail: detail.slice(0, 300) })
      return { ok: false, reason: 'failed' }
    }
    const body = (await response.json()) as { text?: unknown }
    return { ok: true, text: typeof body.text === 'string' ? body.text.trim() : '' }
  } catch (error) {
    console.error('[assistant] transcription failed', { message: error instanceof Error ? error.message : String(error) })
    return { ok: false, reason: 'failed' }
  }
}
