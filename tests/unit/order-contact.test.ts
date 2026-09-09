import {
  decideContactWrite,
  isRealContact,
  parseContactSubmission,
} from '@/lib/order-contact'
import { shouldRingForTransition } from '@/lib/order-ready-alert'

/**
 * Receipt-QR contact capture: a walk-in/POS customer scans the receipt and
 * attaches their number to the order. The write is once-only — the tracking
 * token is printed on paper anyone can photograph, so it must never let a
 * holder overwrite a contact the customer already gave.
 */

describe('isRealContact', () => {
  it('treats placeholders and blanks as no contact', () => {
    for (const v of [undefined, null, '', '  ', 'n/a', 'N/A', 'na', '-', 'none']) {
      expect(isRealContact(v)).toBe(false)
    }
  })

  it('treats an actual phone number or handle as a contact', () => {
    expect(isRealContact('09171234567')).toBe(true)
    expect(isRealContact('@juandc')).toBe(true)
  })
})

describe('parseContactSubmission', () => {
  const valid = {
    orderId: 'order-1',
    tenantId: 'tenant-1',
    token: 'deadbeef',
    contact: ' 09171234567 ',
    name: ' Juan ',
  }

  it('accepts a valid submission and trims it', () => {
    const parsed = parseContactSubmission(valid)
    expect(parsed).toEqual({
      orderId: 'order-1',
      tenantId: 'tenant-1',
      token: 'deadbeef',
      contact: '09171234567',
      name: 'Juan',
    })
  })

  it('accepts a submission without a name', () => {
    const { name: _name, ...rest } = valid
    expect(parseContactSubmission(rest)?.name).toBeUndefined()
  })

  it('rejects garbage, blank contacts, and oversized fields', () => {
    expect(parseContactSubmission(null)).toBeNull()
    expect(parseContactSubmission({})).toBeNull()
    expect(parseContactSubmission({ ...valid, contact: '   ' })).toBeNull()
    expect(parseContactSubmission({ ...valid, contact: 'x'.repeat(80) })).toBeNull()
    expect(parseContactSubmission({ ...valid, token: '' })).toBeNull()
  })
})

describe('decideContactWrite — once-only', () => {
  it('allows the write when the order has no real contact', () => {
    const decision = decideContactWrite(
      { contact: 'n/a', name: 'Walk-in' },
      { contact: '09171234567', name: 'Juan' },
    )
    expect(decision).toEqual({
      ok: true,
      contact: '09171234567',
      // The placeholder name is replaced along with the placeholder contact…
      name: 'Juan',
    })
  })

  it('keeps a real customer name even while filling in the contact', () => {
    const decision = decideContactWrite(
      { contact: '', name: 'Maria Clara' },
      { contact: '09171234567', name: 'Impostor' },
    )
    expect(decision).toEqual({ ok: true, contact: '09171234567', name: undefined })
  })

  it('refuses when a real contact is already on the order', () => {
    const decision = decideContactWrite(
      { contact: '09998887777' },
      { contact: '09171234567' },
    )
    expect(decision).toEqual({ ok: false, error: 'already_set' })
  })
})

describe('decideContactWrite — the claim window', () => {
  const input = { contact: '09171234567', name: 'Juan' }

  it('accepts the write right up to the moment the order is ready', () => {
    for (const status of ['pending', 'confirmed', 'preparing', 'ready']) {
      expect(decideContactWrite({ contact: null, status }, input).ok).toBe(true)
    }
  })

  it('refuses once the order is handed over — a found receipt claims nothing', () => {
    expect(decideContactWrite({ contact: null, status: 'delivered' }, input)).toEqual({
      ok: false,
      error: 'claim_closed',
    })
  })

  it('refuses a cancelled order', () => {
    expect(decideContactWrite({ contact: null, status: 'cancelled' }, input)).toEqual({
      ok: false,
      error: 'claim_closed',
    })
  })

  it('still reports an already-claimed order as already set, even after delivery', () => {
    expect(decideContactWrite({ contact: '09998887777', status: 'delivered' }, input)).toEqual({
      ok: false,
      error: 'already_set',
    })
  })

  it('accepts a write when the caller reported no status at all', () => {
    expect(decideContactWrite({ contact: null }, input).ok).toBe(true)
  })
})

describe('shouldRingForTransition', () => {
  it('rings exactly when the order becomes ready', () => {
    expect(shouldRingForTransition('preparing', 'ready')).toBe(true)
    expect(shouldRingForTransition('confirmed', 'ready')).toBe(true)
  })

  it('does not ring on first load, repeats, or other transitions', () => {
    expect(shouldRingForTransition(null, 'ready')).toBe(false) // first poll
    expect(shouldRingForTransition('ready', 'ready')).toBe(false)
    expect(shouldRingForTransition('pending', 'confirmed')).toBe(false)
    expect(shouldRingForTransition('ready', 'delivered')).toBe(false)
  })
})
