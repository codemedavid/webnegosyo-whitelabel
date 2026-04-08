import { initMetaPixel, trackMetaEvent } from '@/lib/meta-pixel'

declare global {
  interface Window {
    fbq?: jest.Mock
    _fbq?: jest.Mock
  }
}

describe('meta-pixel', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    delete window.fbq
    delete window._fbq
  })

  it('initializes the pixel and tracks a page view when fbq is already available', () => {
    window.fbq = jest.fn()

    initMetaPixel('123456789')

    expect(window.fbq).toHaveBeenCalledWith('init', '123456789')
    expect(window.fbq).toHaveBeenCalledWith('track', 'PageView')
  })

  it('tracks custom events with an event id', () => {
    window.fbq = jest.fn()

    trackMetaEvent('Lead', { value: 3899, currency: 'PHP' }, 'event-123')

    expect(window.fbq).toHaveBeenCalledWith(
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

    expect(window.fbq).toBeDefined()
    expect(window._fbq).toBe(window.fbq)
    expect(window.fbq?.queue).toEqual([
      ['init', '123456789'],
      ['track', 'PageView'],
    ])
  })
})
