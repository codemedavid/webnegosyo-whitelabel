import { createHash } from 'crypto'
import { sendMetaConversionEvent } from '@/lib/meta-conversions'

describe('meta-conversions', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetAllMocks()
    process.env = {
      ...originalEnv,
      META_PIXEL_ID: '123456789',
      META_CONVERSIONS_API_TOKEN: 'test-token',
      META_TEST_EVENT_CODE: 'TEST12345',
    }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    } as Response)
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('sends a lead event with hashed user data and test event code', async () => {
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
      },
      customData: {
        currency: 'PHP',
        value: 3899,
        reference_number: 'REF-123',
      },
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v20.0/123456789/events')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    expect(body.test_event_code).toBe('TEST12345')
    expect(body.data[0].event_name).toBe('Lead')
    expect(body.data[0].event_id).toBe('lead-123')
    expect(body.data[0].user_data.em[0]).toBe(
      createHash('sha256').update('test@example.com').digest('hex')
    )
    expect(body.data[0].custom_data.value).toBe(3899)
    expect(body.data[0].custom_data.reference_number).toBe('REF-123')
  })
})
