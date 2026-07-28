import { describe, it, expect, beforeEach } from '@jest/globals'
import {
  OUTLET_SELECTION_KEY_PREFIX,
  OUTLET_SELECTION_TTL_MS,
  readOutletSelection,
  writeOutletSelection,
  clearOutletSelection,
  resolveOutletSelection,
  type StoredOutletSelection,
  type SelectableOutlet,
} from '@/lib/outlets/outlet-selection'

/**
 * The decision core of the storefront flow: given the flag, the tenant's
 * branches, whatever the customer chose last time, and whatever the URL says,
 * what do we show?
 *
 * Every edge case from the spec lands here rather than in a component, because
 * these are the states that silently strand a customer — a stored branch that
 * has since been switched off, a delivery-only link to a pickup-only branch, or
 * a picker shown to a merchant who only has one shop.
 */

class FakeStorage {
  private data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
  get size(): number {
    return this.data.size
  }
  raw(key: string): string | null {
    return this.data.get(key) ?? null
  }
}

const NOW = Date.parse('2026-07-28T00:00:00.000Z')

const outlet = (overrides: Partial<SelectableOutlet> = {}): SelectableOutlet => ({
  id: 'outlet-bgc',
  slug: 'bgc',
  name: 'BGC',
  latitude: 14.55,
  longitude: 121.04,
  delivery_radius_km: null,
  supports_pickup: true,
  supports_delivery: true,
  is_active: true,
  sort_order: 0,
  ...overrides,
})

const twoOutlets = [
  outlet(),
  outlet({ id: 'outlet-alabang', slug: 'alabang', name: 'Alabang', sort_order: 1 }),
]

describe('outlet selection storage', () => {
  let storage: FakeStorage

  beforeEach(() => {
    storage = new FakeStorage()
  })

  it('scopes the key to the tenant so two shops never share a choice', () => {
    writeOutletSelection(storage, 'lucky-joy', { outletId: 'outlet-bgc', mode: 'pickup' }, NOW)
    expect(storage.raw(`${OUTLET_SELECTION_KEY_PREFIX}lucky-joy`)).not.toBeNull()
    expect(storage.raw(`${OUTLET_SELECTION_KEY_PREFIX}other-shop`)).toBeNull()
  })

  it('round-trips a selection', () => {
    writeOutletSelection(storage, 'lucky-joy', { outletId: 'outlet-bgc', mode: 'delivery' }, NOW)
    expect(readOutletSelection(storage, 'lucky-joy', NOW)).toEqual({
      outletId: 'outlet-bgc',
      mode: 'delivery',
    })
  })

  it('still returns a selection just before it expires', () => {
    writeOutletSelection(storage, 'lucky-joy', { outletId: 'outlet-bgc', mode: 'pickup' }, NOW)
    const justInside = NOW + OUTLET_SELECTION_TTL_MS - 1
    expect(readOutletSelection(storage, 'lucky-joy', justInside)).not.toBeNull()
  })

  it('drops a selection once it expires', () => {
    writeOutletSelection(storage, 'lucky-joy', { outletId: 'outlet-bgc', mode: 'pickup' }, NOW)
    expect(readOutletSelection(storage, 'lucky-joy', NOW + OUTLET_SELECTION_TTL_MS + 1)).toBeNull()
  })

  it('clears the expired entry rather than leaving it to rot', () => {
    writeOutletSelection(storage, 'lucky-joy', { outletId: 'outlet-bgc', mode: 'pickup' }, NOW)
    readOutletSelection(storage, 'lucky-joy', NOW + OUTLET_SELECTION_TTL_MS + 1)
    expect(storage.size).toBe(0)
  })

  it('returns null when nothing was ever stored', () => {
    expect(readOutletSelection(storage, 'lucky-joy', NOW)).toBeNull()
  })

  it('survives corrupt JSON instead of throwing at the customer', () => {
    storage.setItem(`${OUTLET_SELECTION_KEY_PREFIX}lucky-joy`, '{not json')
    expect(readOutletSelection(storage, 'lucky-joy', NOW)).toBeNull()
  })

  it('rejects a stored value of the wrong shape', () => {
    storage.setItem(`${OUTLET_SELECTION_KEY_PREFIX}lucky-joy`, JSON.stringify({ hello: 'world' }))
    expect(readOutletSelection(storage, 'lucky-joy', NOW)).toBeNull()
  })

  it('rejects a stored mode that is not pickup or delivery', () => {
    storage.setItem(
      `${OUTLET_SELECTION_KEY_PREFIX}lucky-joy`,
      JSON.stringify({ outletId: 'x', mode: 'teleport', savedAt: NOW })
    )
    expect(readOutletSelection(storage, 'lucky-joy', NOW)).toBeNull()
  })

  it('clears on request', () => {
    writeOutletSelection(storage, 'lucky-joy', { outletId: 'outlet-bgc', mode: 'pickup' }, NOW)
    clearOutletSelection(storage, 'lucky-joy')
    expect(readOutletSelection(storage, 'lucky-joy', NOW)).toBeNull()
  })

  it('never throws when storage itself is unavailable', () => {
    // Safari private mode throws on setItem; a storefront must not break.
    const hostile = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    expect(() => writeOutletSelection(hostile, 't', { outletId: 'a', mode: 'pickup' }, NOW)).not.toThrow()
    expect(readOutletSelection(hostile, 't', NOW)).toBeNull()
    expect(() => clearOutletSelection(hostile, 't')).not.toThrow()
  })
})

describe('resolveOutletSelection — when the flow is skipped entirely', () => {
  it('does nothing when the flag is off, even with several branches', () => {
    const result = resolveOutletSelection({
      isEnabled: false,
      outlets: twoOutlets,
      stored: null,
      urlSlug: null,
    })
    expect(result.shouldPrompt).toBe(false)
    expect(result.outlet).toBeNull()
  })

  it('tells the caller to clear storage when the flag is off', () => {
    // Turning the flag off must not leave a stale selection behind that would
    // reappear if it is ever switched back on.
    const result = resolveOutletSelection({
      isEnabled: false,
      outlets: twoOutlets,
      stored: { outletId: 'outlet-bgc', mode: 'pickup' },
      urlSlug: null,
    })
    expect(result.shouldClearStorage).toBe(true)
  })

  it('skips the picker for a tenant with no branches yet', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: [],
      stored: null,
      urlSlug: null,
    })
    expect(result.shouldPrompt).toBe(false)
    expect(result.outlet).toBeNull()
  })

  it('auto-selects the only branch instead of asking', () => {
    const only = outlet()
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: [only],
      stored: null,
      urlSlug: null,
    })
    expect(result.shouldPrompt).toBe(false)
    expect(result.outlet?.id).toBe(only.id)
  })

  it('treats one active branch among several inactive ones as single-branch', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: [outlet(), outlet({ id: 'closed', slug: 'closed', is_active: false })],
      stored: null,
      urlSlug: null,
    })
    expect(result.shouldPrompt).toBe(false)
    expect(result.outlet?.id).toBe('outlet-bgc')
  })
})

describe('resolveOutletSelection — deep links win', () => {
  it('uses the slug from the URL', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: null,
      urlSlug: 'alabang',
    })
    expect(result.outlet?.slug).toBe('alabang')
    expect(result.shouldPrompt).toBe(false)
  })

  it('overrides a different stored selection', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: { outletId: 'outlet-bgc', mode: 'pickup' },
      urlSlug: 'alabang',
    })
    expect(result.outlet?.slug).toBe('alabang')
  })

  it('matches the slug case-insensitively, since links get retyped', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: null,
      urlSlug: 'ALABANG',
    })
    expect(result.outlet?.slug).toBe('alabang')
  })

  it('falls back to the picker for an unknown slug rather than 404ing the menu', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: null,
      urlSlug: 'does-not-exist',
    })
    expect(result.outlet).toBeNull()
    expect(result.shouldPrompt).toBe(true)
    expect(result.reason).toBe('unknown-link')
  })

  it('ignores a link to a branch that has been switched off', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: [...twoOutlets, outlet({ id: 'gone', slug: 'gone', is_active: false })],
      stored: null,
      urlSlug: 'gone',
    })
    expect(result.outlet).toBeNull()
    expect(result.reason).toBe('unknown-link')
  })

  it('still auto-selects the single branch when a link names it', () => {
    const only = outlet()
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: [only],
      stored: null,
      urlSlug: 'bgc',
    })
    expect(result.outlet?.id).toBe(only.id)
  })
})

describe('resolveOutletSelection — the stored choice', () => {
  it('reuses a valid stored selection without asking again', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: { outletId: 'outlet-alabang', mode: 'delivery' },
      urlSlug: null,
    })
    expect(result.outlet?.id).toBe('outlet-alabang')
    expect(result.mode).toBe('delivery')
    expect(result.shouldPrompt).toBe(false)
  })

  it('re-prompts when the stored branch has since been deactivated', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: [...twoOutlets, outlet({ id: 'gone', slug: 'gone', is_active: false })],
      stored: { outletId: 'gone', mode: 'pickup' },
      urlSlug: null,
    })
    expect(result.shouldPrompt).toBe(true)
    expect(result.outlet).toBeNull()
    expect(result.reason).toBe('outlet-unavailable')
  })

  it('re-prompts when the stored branch no longer exists at all', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: { outletId: 'deleted-outlet', mode: 'pickup' },
      urlSlug: null,
    })
    expect(result.shouldPrompt).toBe(true)
    expect(result.reason).toBe('outlet-unavailable')
  })

  it('clears the dead stored selection so the prompt is not asked twice', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: { outletId: 'deleted-outlet', mode: 'pickup' },
      urlSlug: null,
    })
    expect(result.shouldClearStorage).toBe(true)
  })

  it('re-prompts when the stored branch stopped supporting the stored mode', () => {
    // Prevents the unreachable state the spec calls out: delivery selected at a
    // branch that no longer delivers.
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: [
        outlet({ supports_delivery: false }),
        outlet({ id: 'outlet-alabang', slug: 'alabang', sort_order: 1 }),
      ],
      stored: { outletId: 'outlet-bgc', mode: 'delivery' },
      urlSlug: null,
    })
    expect(result.shouldPrompt).toBe(true)
    expect(result.reason).toBe('mode-unsupported')
  })

  it('prompts when there is no stored selection and several branches', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: null,
      urlSlug: null,
    })
    expect(result.shouldPrompt).toBe(true)
    expect(result.reason).toBe('no-selection')
  })
})

describe('resolveOutletSelection — what the picker is given', () => {
  it('offers only active branches', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: [...twoOutlets, outlet({ id: 'closed', slug: 'closed', is_active: false })],
      stored: null,
      urlSlug: null,
    })
    expect(result.choices.map((o) => o.slug)).toEqual(['bgc', 'alabang'])
  })

  it('orders the choices by the merchant’s manual order', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: [
        outlet({ id: 'c', slug: 'ccc', sort_order: 2 }),
        outlet({ id: 'a', slug: 'aaa', sort_order: 0 }),
        outlet({ id: 'b', slug: 'bbb', sort_order: 1 }),
      ],
      stored: null,
      urlSlug: null,
    })
    expect(result.choices.map((o) => o.slug)).toEqual(['aaa', 'bbb', 'ccc'])
  })

  it('does not mutate the outlets array it was handed', () => {
    const input = [
      outlet({ id: 'c', slug: 'ccc', sort_order: 2 }),
      outlet({ id: 'a', slug: 'aaa', sort_order: 0 }),
    ]
    const snapshot = input.map((o) => o.id)
    resolveOutletSelection({ isEnabled: true, outlets: input, stored: null, urlSlug: null })
    expect(input.map((o) => o.id)).toEqual(snapshot)
  })
})

describe('resolveOutletSelection — switching outlets with a cart', () => {
  it('flags that the cart must be confirmed before a switch', () => {
    const stored: StoredOutletSelection = { outletId: 'outlet-bgc', mode: 'pickup' }
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored,
      urlSlug: 'alabang',
      hasCartItems: true,
    })
    expect(result.requiresCartConfirmation).toBe(true)
  })

  it('does not ask about the cart when the branch is not actually changing', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: { outletId: 'outlet-bgc', mode: 'pickup' },
      urlSlug: 'bgc',
      hasCartItems: true,
    })
    expect(result.requiresCartConfirmation).toBe(false)
  })

  it('does not ask about an empty cart', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: twoOutlets,
      stored: { outletId: 'outlet-bgc', mode: 'pickup' },
      urlSlug: 'alabang',
      hasCartItems: false,
    })
    expect(result.requiresCartConfirmation).toBe(false)
  })
})
