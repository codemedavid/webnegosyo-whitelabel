/**
 * The tracking page's "ring me when it's ready" alarm. It used to play one
 * half-second chime and a 0.5 s buzz — easy to miss across a noisy room — so
 * it now rings in repeating bursts until the customer acknowledges it.
 */
import {
  buildReadyNotice,
  READY_PREVIEW_TONES,
  READY_RING_MAX_MS,
  READY_RING_REPEAT_MS,
  READY_RING_TONES,
  READY_VIBRATION_PATTERN,
} from '@/lib/order-ready-alert'

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

describe('ready alarm cadence', () => {
  test('one ring burst ends before the next one starts', () => {
    const burstEndS = Math.max(...READY_RING_TONES.map((tone) => tone.startS + tone.durationS))
    expect(burstEndS * 1000).toBeLessThan(READY_RING_REPEAT_MS)
  })

  test('the vibration buzzes for most of each cycle and never overlaps the next', () => {
    const buzzMs = sum(READY_VIBRATION_PATTERN.filter((_, index) => index % 2 === 0))
    expect(buzzMs).toBeGreaterThanOrEqual(2000)
    expect(sum(READY_VIBRATION_PATTERN)).toBeLessThan(READY_RING_REPEAT_MS)
  })

  test('rings for long enough to be heard, then gives up', () => {
    expect(READY_RING_MAX_MS).toBeGreaterThanOrEqual(60_000)
    expect(READY_RING_MAX_MS).toBeLessThanOrEqual(5 * 60_000)
  })

  test('the tap-time preview is a short slice of the real ring', () => {
    expect(READY_PREVIEW_TONES.length).toBeGreaterThan(0)
    expect(READY_PREVIEW_TONES.length).toBeLessThan(READY_RING_TONES.length)
    READY_PREVIEW_TONES.forEach((tone, index) => expect(tone).toEqual(READY_RING_TONES[index]))
  })
})

describe('buildReadyNotice', () => {
  test('tells a pickup customer to come collect', () => {
    const notice = buildReadyNotice({ shortId: '07', storeName: 'Kape Ni Juan', kind: 'pickup' })
    expect(notice.title).toBe('Your order is ready!')
    expect(notice.body).toBe('Order #07 from Kape Ni Juan is ready for pickup.')
  })

  test('does not tell a delivery customer to pick up', () => {
    const notice = buildReadyNotice({ shortId: '07', storeName: 'Kape Ni Juan', kind: 'delivery' })
    expect(notice.body).not.toMatch(/pickup/i)
    expect(notice.body).toBe('Order #07 from Kape Ni Juan is ready and will be on its way soon.')
  })

  test('keeps a neutral line for dine-in and unknown kinds', () => {
    expect(buildReadyNotice({ shortId: '12', storeName: 'Súkad', kind: 'dine_in' }).body).toBe('Order #12 from Súkad is ready.')
    expect(buildReadyNotice({ shortId: '12', storeName: 'Súkad', kind: null }).body).toBe('Order #12 from Súkad is ready.')
  })
})
