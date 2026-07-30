/**
 * Kiosk mode — the pure decision layer.
 *
 * A storefront running on a tablet by the counter behaves differently from one
 * on a customer's phone: it never hands off to Messenger, and it returns itself
 * to the menu after an order so the next customer finds a clean screen.
 *
 * These tests pin the decision itself. Reading the URL, touching storage and
 * navigating are the hook's job — see kiosk-checkout-return.test.tsx.
 */

import {
  KIOSK_PARAM,
  KIOSK_RETURN_DELAY_MS,
  clearKioskMode,
  kioskReturnPath,
  parseKioskParam,
  readKioskMode,
  resolveKioskMode,
  writeKioskMode,
  type StorageLike,
} from '@/lib/kiosk/kiosk-mode'

/** An in-memory Storage that also lets a test make access throw. */
function createStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  let shouldThrow = false
  const storage: StorageLike = {
    getItem: (key) => {
      if (shouldThrow) throw new Error('storage disabled')
      return map.get(key) ?? null
    },
    setItem: (key, value) => {
      if (shouldThrow) throw new Error('storage disabled')
      map.set(key, value)
    },
    removeItem: (key) => {
      if (shouldThrow) throw new Error('storage disabled')
      map.delete(key)
    },
  }
  return {
    storage,
    map,
    breakStorage: () => {
      shouldThrow = true
    },
  }
}

describe('parseKioskParam', () => {
  it.each(['1', 'true', 'yes', 'on', 'TRUE', ' 1 '])('reads %p as kiosk on', (value) => {
    expect(parseKioskParam(value)).toBe(true)
  })

  it.each(['0', 'false', 'no', 'off', 'FALSE'])('reads %p as an explicit kiosk exit', (value) => {
    expect(parseKioskParam(value)).toBe(false)
  })

  it.each([null, undefined, '', '   '])('reads %p as "the URL says nothing"', (value) => {
    expect(parseKioskParam(value)).toBeNull()
  })

  it('treats an unrecognised value as saying nothing rather than guessing', () => {
    expect(parseKioskParam('maybe')).toBeNull()
  })
})

describe('resolveKioskMode', () => {
  it('turns kiosk mode on when the URL asks for it', () => {
    // Arrange
    const input = { urlValue: '1', stored: false }

    // Act
    const result = resolveKioskMode(input)

    // Assert
    expect(result.isKiosk).toBe(true)
  })

  it('persists the choice so in-app navigation keeps kiosk mode', () => {
    const result = resolveKioskMode({ urlValue: '1', stored: false })

    expect(result.shouldPersist).toBe(true)
  })

  it('does not rewrite storage when the URL only confirms what is stored', () => {
    const result = resolveKioskMode({ urlValue: '1', stored: true })

    expect(result.shouldPersist).toBe(false)
  })

  it('stays in kiosk mode on a page the customer reached without the param', () => {
    // The cart and checkout are reached by router.push, which drops the query.
    const result = resolveKioskMode({ urlValue: null, stored: true })

    expect(result.isKiosk).toBe(true)
  })

  it('leaves storage alone when the URL says nothing', () => {
    const result = resolveKioskMode({ urlValue: null, stored: true })

    expect(result).toMatchObject({ shouldPersist: false, shouldClearStorage: false })
  })

  it('is off for an ordinary customer with no param and nothing stored', () => {
    const result = resolveKioskMode({ urlValue: null, stored: false })

    expect(result.isKiosk).toBe(false)
  })

  it('lets ?kiosk=0 take a tablet out of kiosk mode', () => {
    // Without this, leaving kiosk mode needs devtools on the tablet.
    const result = resolveKioskMode({ urlValue: '0', stored: true })

    expect(result.isKiosk).toBe(false)
  })

  it('clears the stored flag when the URL exits kiosk mode', () => {
    const result = resolveKioskMode({ urlValue: '0', stored: true })

    expect(result.shouldClearStorage).toBe(true)
  })

  it('has nothing to clear when exiting a mode that was never stored', () => {
    const result = resolveKioskMode({ urlValue: '0', stored: false })

    expect(result.shouldClearStorage).toBe(false)
  })

  it('ignores an unrecognised param instead of dropping out of kiosk mode', () => {
    const result = resolveKioskMode({ urlValue: 'maybe', stored: true })

    expect(result.isKiosk).toBe(true)
  })
})

describe('kiosk mode storage', () => {
  it('reads back a flag it wrote', () => {
    // Arrange
    const { storage } = createStorage()

    // Act
    writeKioskMode(storage, 'acme')

    // Assert
    expect(readKioskMode(storage, 'acme')).toBe(true)
  })

  it('keeps one tenant\'s kiosk flag out of another\'s storefront', () => {
    const { storage } = createStorage()

    writeKioskMode(storage, 'acme')

    expect(readKioskMode(storage, 'other-shop')).toBe(false)
  })

  it('reports kiosk off when nothing was ever written', () => {
    const { storage } = createStorage()

    expect(readKioskMode(storage, 'acme')).toBe(false)
  })

  it('forgets the flag once cleared', () => {
    const { storage } = createStorage()
    writeKioskMode(storage, 'acme')

    clearKioskMode(storage, 'acme')

    expect(readKioskMode(storage, 'acme')).toBe(false)
  })

  it('ignores a corrupt stored value rather than throwing', () => {
    const { storage } = createStorage({ kiosk_mode_acme: '{oops' })

    expect(readKioskMode(storage, 'acme')).toBe(false)
  })

  it('survives storage being unavailable, as in Safari private mode', () => {
    // A storefront must not break over where we cached a preference.
    const { storage, breakStorage } = createStorage()
    breakStorage()

    expect(() => writeKioskMode(storage, 'acme')).not.toThrow()
    expect(() => clearKioskMode(storage, 'acme')).not.toThrow()
    expect(readKioskMode(storage, 'acme')).toBe(false)
  })
})

describe('kioskReturnPath', () => {
  it('returns to the tenant menu carrying the kiosk param', () => {
    expect(kioskReturnPath('acme')).toBe('/acme/menu?kiosk=1')
  })

  it('uses the same param name the URL is read from', () => {
    expect(kioskReturnPath('acme')).toContain(`${KIOSK_PARAM}=1`)
  })
})

describe('KIOSK_RETURN_DELAY_MS', () => {
  it('gives the customer three seconds to read the confirmation', () => {
    expect(KIOSK_RETURN_DELAY_MS).toBe(3000)
  })
})
