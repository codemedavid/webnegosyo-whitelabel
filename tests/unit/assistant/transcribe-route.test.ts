/** @jest-environment node */
/**
 * Voice → text for the Owl: every refusal (bad upload, no access, too many
 * clips, voice not configured) happens before OpenRouter is called, and only the
 * transcript — never the audio — comes back.
 */
import { NextRequest } from 'next/server'

jest.mock('server-only', () => ({}))

const mockAccess = jest.fn()
jest.mock('@/lib/assistant/access', () => ({ resolveAssistantAccess: (...args: unknown[]) => mockAccess(...args) }))

const mockRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const ALLOWED = { allowed: true, retryAfterSec: 0 }
const fetchMock = jest.fn()

function upload({ tenantId = TENANT, audio = new Blob(['voice'], { type: 'audio/webm' }) as Blob | null, filename = 'voice.webm' } = {}) {
  const form = new FormData()
  if (tenantId !== null) form.append('tenantId', tenantId)
  if (audio) form.append('audio', audio, filename)
  return new NextRequest('https://example.test/api/assistant/transcribe', { method: 'POST', body: form })
}

async function loadRoute() {
  return import('@/app/api/assistant/transcribe/route')
}

beforeEach(() => {
  jest.resetModules()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
  process.env.OPENROUTER_API_KEY = 'test-key'
  delete process.env.ASSISTANT_TRANSCRIBE_MODEL
  mockAccess.mockResolvedValue({ ok: true, caller: { userId: 'user-1' }, store: { id: TENANT, slug: 's', name: 'Store' }, flags: {} })
  mockRateLimit.mockResolvedValue(ALLOWED)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('POST /api/assistant/transcribe', () => {
  test('returns the transcript Whisper heard', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: '  Magkano benta ko today?  ' }), { status: 200 }))
    const { POST } = await loadRoute()

    const response = await POST(upload())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ text: 'Magkano benta ko today?' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions')
    expect(init.headers.Authorization).toBe('Bearer test-key')
    const sent = init.body as FormData
    expect(sent.get('model')).toBe('openai/whisper-large-v3')
    expect(sent.get('file')).toBeInstanceOf(Blob)
  })

  test('honours a model override from the environment', async () => {
    process.env.ASSISTANT_TRANSCRIBE_MODEL = 'openai/whisper-large-v3-turbo'
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: 'hi' }), { status: 200 }))
    const { POST } = await loadRoute()

    await POST(upload())

    expect((fetchMock.mock.calls[0][1].body as FormData).get('model')).toBe('openai/whisper-large-v3-turbo')
  })

  test('refuses an upload with no audio', async () => {
    const { POST } = await loadRoute()

    const response = await POST(upload({ audio: null }))

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('refuses a file that is not audio', async () => {
    const { POST } = await loadRoute()

    const response = await POST(upload({ audio: new Blob(['x'], { type: 'image/png' }), filename: 'x.png' }))

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('refuses a clip over the size limit', async () => {
    const { MAX_VOICE_BYTES } = await import('@/lib/assistant/limits')
    const { POST } = await loadRoute()

    const response = await POST(upload({ audio: new Blob([new Uint8Array(MAX_VOICE_BYTES + 1)], { type: 'audio/webm' }) }))

    expect(response.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('refuses an empty clip', async () => {
    const { POST } = await loadRoute()

    const response = await POST(upload({ audio: new Blob([], { type: 'audio/webm' }) }))

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('passes on the access refusal', async () => {
    mockAccess.mockResolvedValue({ ok: false, status: 403, error: 'The assistant is not on for this store.' })
    const { POST } = await loadRoute()

    const response = await POST(upload())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'The assistant is not on for this store.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('rate-limits per person with a Retry-After', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30 })
    const { POST } = await loadRoute()

    const response = await POST(upload())

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(mockRateLimit.mock.calls[0][0]).toContain('user-1')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('says voice is not set up when the OpenRouter key is missing', async () => {
    delete process.env.OPENROUTER_API_KEY
    const { POST } = await loadRoute()

    const response = await POST(upload())

    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('hides the provider error and logs it', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"message":"bad key sk-123"}}', { status: 401 }))
    const { POST } = await loadRoute()

    const response = await POST(upload())

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).not.toContain('sk-123')
    expect(console.error).toHaveBeenCalled()
  })

  test('says nothing was heard when the transcript is blank', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: '   ' }), { status: 200 }))
    const { POST } = await loadRoute()

    const response = await POST(upload())

    expect(response.status).toBe(422)
  })

  test('caps the transcript at the message limit', async () => {
    const { MAX_INPUT_CHARS } = await import('@/lib/assistant/limits')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: 'a'.repeat(MAX_INPUT_CHARS + 50) }), { status: 200 }))
    const { POST } = await loadRoute()

    const response = await POST(upload())

    expect((await response.json()).text).toHaveLength(MAX_INPUT_CHARS)
  })
})
