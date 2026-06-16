import { initMetaPixel, trackMetaEvent } from '@/lib/meta-pixel'

type FbqGlobal = {
  fbq?: jest.Mock & { queue?: unknown[] }
  _fbq?: jest.Mock
}

const fbqGlobal = globalThis as unknown as FbqGlobal

describe('meta-pixel', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    delete fbqGlobal.fbq
    delete fbqGlobal._fbq
  })

  it('initializes the pixel and tracks a page view when fbq is already available', () => {
    fbqGlobal.fbq = jest.fn()

    initMetaPixel('123456789')

    expect(fbqGlobal.fbq).toHaveBeenCalledWith('init', '123456789')
    expect(fbqGlobal.fbq).toHaveBeenCalledWith('track', 'PageView')
  })

  it('tracks custom events with an event id', () => {
    fbqGlobal.fbq = jest.fn()

    trackMetaEvent('Lead', { value: 3899, currency: 'PHP' }, 'event-123')

    expect(fbqGlobal.fbq).toHaveBeenCalledWith(
      'track',
      'Lead',
      { value: 3899, currency: 'PHP' },
      { eventID: 'event-123' }
    )
  })

  it('injects the Meta Pixel script when fbq is not yet present', () => {
    initMetaPixel('123456789')

    const script = document.querySelector('script[src="https://connect.facebook.net/en_US/fbevents.js"]')
    expect(script).not.toBeNull()
  })

  it('installs a queueing stub before the Meta Pixel script finishes loading', () => {
    initMetaPixel('123456789')

    expect(fbqGlobal.fbq).toBeDefined()
    expect(fbqGlobal._fbq).toBe(fbqGlobal.fbq)
    expect(fbqGlobal.fbq?.queue).toEqual([
      ['init', '123456789'],
      ['track', 'PageView'],
    ])
  })
})
