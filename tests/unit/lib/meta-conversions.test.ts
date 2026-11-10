import { createHash } from 'crypto'
import { readMetaConversionsConfig, sendMetaConversionEvent } from '@/lib/meta-conversions'

const sha = (value: string) => createHash('sha256').update(value).digest('hex')

describe('meta-conversions', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetAllMocks()
    process.env = {
      ...originalEnv,
      META_PIXEL_ID: '123456789',
      META_CONVERSIONS_API_TOKEN: 'test-token',
      META_TEST_EVENT_CODE: 'TEST12345',
      VERCEL_ENV: 'preview',
    }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    } as Response)
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('sends a lead event with hashed user data and the test code outside production', async () => {
    await sendMetaConversionEvent({
      eventName: 'Lead',
      eventId: 'lead-123',
      eventSourceUrl: 'https://example.com/checkout',
      userData: {
        email: 'Test@Example.com ',
        phone: '09171234567',
        fbp: 'fb.1.123',
        fbc: 'fb.1.456',
        clientIpAddress: '127.0.0.1',
        clientUserAgent: 'jest',
        externalId: 'SM-123',
        country: 'PH',
      },
      customData: {
        currency: 'PHP',
        value: 3899,
        reference_number: 'REF-123',
      },
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v24.0/123456789/events')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    expect(body.test_event_code).toBe('TEST12345')
    expect(body.data[0].event_name).toBe('Lead')
    expect(body.data[0].event_id).toBe('lead-123')
    expect(body.data[0].user_data.em[0]).toBe(sha('test@example.com'))
    expect(body.data[0].user_data.ph[0]).toBe(sha('639171234567'))
    expect(body.data[0].user_data.external_id[0]).toBe(sha('SM-123'))
    expect(body.data[0].user_data.country[0]).toBe(sha('ph'))
    expect(body.data[0].user_data.client_ip_address).toBe('127.0.0.1')
    expect(body.data[0].custom_data.value).toBe(3899)
    expect(body.data[0].custom_data.reference_number).toBe('REF-123')
  })

  it('never sends the test event code in production (it would hide every real event)', async () => {
    process.env.VERCEL_ENV = 'production'
    await sendMetaConversionEvent({ eventName: 'Purchase', eventId: 'purchase_SM-1' })
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string)
    expect(body).not.toHaveProperty('test_event_code')
  })

  it('reads the token Vercel actually holds (META_CONVERSIONS_API_ACCESS_TOKEN)', async () => {
    delete process.env.META_CONVERSIONS_API_TOKEN
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = 'vercel-token'
    expect(readMetaConversionsConfig().accessToken).toBe('vercel-token')

    const result = await sendMetaConversionEvent({ eventName: 'Lead', eventId: 'lead-1' })
    expect(result.sent).toBe(true)
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string)
    expect(body.access_token).toBe('vercel-token')
  })

  it('skips quietly when no token is configured', async () => {
    delete process.env.META_CONVERSIONS_API_TOKEN
    delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN
    const result = await sendMetaConversionEvent({ eventName: 'Lead', eventId: 'lead-1' })
    expect(result).toEqual({ sent: false, skipped: 'missing-meta-config' })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
