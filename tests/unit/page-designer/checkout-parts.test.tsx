/**
 * Checkout part marks (parts.ts): every checkout block, in every one of its
 * designs, draws the parts its registry entry lists (so the Style tab only
 * offers what is on the page), a chosen option carries `data-on`, and nothing
 * is marked with a part the engine does not know or the block does not list.
 */

import { fireEvent, render, screen } from '@testing-library/react'

import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { CheckoutBlocksProvider } from '@/components/page-designer/checkout/checkout-blocks-context'
import { CHECKOUT_LIVE_BLOCKS } from '@/components/page-designer/checkout/checkout-live-blocks'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'
import { CHECKOUT_BLOCKS } from '@/lib/page-designer/blocks-checkout'
import { PARTS, SHARED_PARTS } from '@/lib/page-designer/parts'
import { createStandardDesign, standardSection } from '@/lib/page-designer/standard-designs'
import type { HeroDesignV5, PageBlockContent } from '@/lib/hero-builder/types'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

jest.mock('@/hooks/use-loyalty-progress', () => ({
  useLoyaltyProgress: () => ({ offer: null, card: null, isLoading: false, error: null, refresh: jest.fn() }),
}))

const runtime: PageRuntime = {
  page: 'checkout',
  state: null,
  tokens: { store: 'Island Silog', total: '₱485.00' },
  labels: {},
  blocks: CHECKOUT_LIVE_BLOCKS,
}

/** State parts: checked by selector (option_on) or not at all (hover, chosen icon). */
const STATE_PARTS = new Set(['option_on', 'option_hover', 'icon_on', 'step_on', 'step_done'])

/** Part id → the `data-part` value components write (`option_label` → `option-label`). */
const attrOf = (part: string) => part.replace(/_/g, '-')

/** Every `data-part` value the engine styles. */
const KNOWN_ATTRS = new Set(PARTS.map((p) => p.id).filter((id) => !STATE_PARTS.has(id)).map(attrOf))

interface Scenario {
  name: string
  checkout?: Record<string, unknown>
  /** Something to tap first (a folded form). */
  open?: () => void
}

const ADDRESS = 'Blk 4 Lot 12, Mabini St'

/** States that bring out each block's conditional parts (errors, chips, links). */
const SCENARIOS: Record<string, readonly Scenario[]> = {
  'checkout.order_type': [
    { name: 'two ways' },
    // Three ways: the switch stands down to tiles; every v3 design still marks its parts.
    {
      name: 'three ways',
      checkout: {
        orderTypes: [
          { id: 'sample-dine-in', name: 'Dine-in', type: 'dine_in', description: 'Eat here', advance_order_enabled: false },
          { id: 'sample-pickup', name: 'Pickup', type: 'pickup', description: 'Pick it up at the counter', advance_order_enabled: true },
          { id: 'sample-delivery', name: 'Delivery', type: 'delivery', description: 'We bring it to you', advance_order_enabled: false },
        ],
      },
    },
  ],
  'checkout.store_closed': [
    { name: 'closed', checkout: { openStatus: { isOpen: false, isOrderingBlocked: true, reason: 'after_close', nextOpenLabel: 'tomorrow at 9:00 AM', closesAt: null } } },
  ],
  'checkout.schedule': [
    { name: 'now' },
    {
      name: 'later, with times',
      checkout: {
        scheduleMode: 'scheduled',
        scheduleDates: [
          { value: '2026-11-06', label: 'Tomorrow', isToday: false },
          { value: '2026-11-07', label: 'Sat, Nov 7', isToday: false },
        ],
        scheduleDate: '2026-11-06',
        timeSlots: [
          { value: '10:00', label: '10:00 AM', minutes: 600 },
          { value: '17:00', label: '5:00 PM', minutes: 1020 },
        ],
        scheduleTime: '10:00',
        scheduledForLabel: 'Tomorrow, 10:00 AM',
      },
    },
  ],
  'checkout.summary': [
    { name: 'free delivery', checkout: { deliveryFee: 0, isDeliveryFeeWaived: true, deliveryFeeAddress: ADDRESS, customerData: { delivery_address: ADDRESS } } },
    { name: 'refused quote', checkout: { deliveryFeeError: 'We do not deliver there yet.' } },
  ],
  'checkout.voucher': [
    { name: 'no code' },
    {
      name: 'codes',
      checkout: {
        voucherCodes: ['SAVE10', 'OLD'],
        voucherPreview: {
          accepted: [{ code: 'SAVE10', name: 'Save 10', amount: 50 }],
          rejected: [{ code: 'OLD', reason: 'expired', message: 'This voucher has expired.' }],
          discountTotal: 50,
          deliveryDiscount: 0,
        },
      },
    },
  ],
  'checkout.gov_discount': [
    {
      name: 'online claim form',
      checkout: {
        govSetup: {
          onlineClaims: true,
          kinds: [
            { kind: 'senior', label: 'Senior Citizen', idLabel: 'OSCA ID number', idPlaceholder: 'e.g. 12345' },
            { kind: 'pwd', label: 'PWD', idLabel: 'PWD ID number', idPlaceholder: 'e.g. 12-3456' },
          ],
        },
      },
      open: () => fireEvent.click(screen.getByRole('button', { name: /Senior Citizen or PWD\?/ })),
    },
    {
      name: 'refused claim',
      checkout: {
        govSetup: { onlineClaims: true, kinds: [{ kind: 'senior', label: 'Senior Citizen', idLabel: 'OSCA ID number', idPlaceholder: '' }] },
        govClaim: { kind: 'senior', name: 'Lola Nena', idNumber: '12345' },
        govPreview: { status: 'refused', message: 'This ID number is not valid.' },
      },
    },
    {
      name: 'folded online claim',
      checkout: { govSetup: { onlineClaims: true, kinds: [{ kind: 'senior', label: 'Senior Citizen', idLabel: 'OSCA ID number', idPlaceholder: '' }] } },
    },
    { name: 'show your ID note' },
  ],
  'checkout.payment': [
    {
      name: 'methods with a QR',
      checkout: {
        paymentMethods: [
          { id: 'sample-gcash', name: 'GCash', details: 'Number: 0917 123 4567', qr_code_url: 'https://example.com/qr.png', require_payment_proof: true },
          { id: 'sample-cash', name: 'Cash', details: null, qr_code_url: null, require_payment_proof: false },
        ],
      },
    },
    // Chosen + Change opens with the list; split asks when to pay first.
    { name: 'nothing chosen yet', checkout: { selectedPaymentMethod: null } },
  ],
  'checkout.place_order': [{ name: 'under the minimum', checkout: { orderMinimum: { meets: false, minimum: 500, shortfall: 15 } } }],
}

function makeCheckout(overrides: Record<string, unknown> = {}): UseCheckoutReturn {
  const sample = buildSampleCheckout(null, 'Island Silog') as unknown as Record<string, unknown>
  return {
    ...sample,
    ...overrides,
    customerData: { ...(sample.customerData as Record<string, string>), ...((overrides.customerData as Record<string, string>) ?? {}) },
  } as unknown as UseCheckoutReturn
}

/** A checkout page holding only `blockId`, with `options` on it. */
function soloDesign(blockId: string, options: Record<string, string>): HeroDesignV5 {
  const section = standardSection('checkout', [blockId])
  return {
    ...createStandardDesign('checkout'),
    sections: [
      {
        ...section,
        columns: section.columns.map((c) => ({
          ...c,
          widgets: c.widgets.map((w) => ({ ...w, content: { ...(w.content as PageBlockContent), options } })),
        })),
      },
    ],
  } as HeroDesignV5
}

/** Every design value a block offers (the `variant` knob), or the one look it has. */
function designsOf(blockId: string): readonly (string | null)[] {
  const knob = CHECKOUT_BLOCKS.find((b) => b.id === blockId)?.options.find((o) => o.key === 'variant')
  return knob && knob.type === 'choice' ? knob.choices.map((c) => c.value) : [null]
}

interface Drawn {
  attrs: Set<string>
  hasChosenOption: boolean
  /** `data-on` / `data-done` on something that is not an option, icon or step. */
  strayStates: string[]
}

function drawnParts(blockId: string, design: string | null, scenario: Scenario): Drawn {
  const { container, unmount } = render(
    <PageRuntimeProvider value={runtime}>
      <CheckoutBlocksProvider value={{ checkout: makeCheckout(scenario.checkout) }}>
        <HeroBuilderRenderer design={soloDesign(blockId, design ? { variant: design } : {})} />
      </CheckoutBlocksProvider>
    </PageRuntimeProvider>,
  )
  scenario.open?.()
  const attrs = new Set([...container.querySelectorAll('[data-part]')].map((el) => el.getAttribute('data-part') ?? ''))
  const hasChosenOption = container.querySelector('[data-part="option"][data-on]') !== null
  const strayStates = [...container.querySelectorAll('[data-on], [data-done]')]
    .map((el) => el.getAttribute('data-part') ?? '(none)')
    .filter((part) => !['option', 'icon', 'step'].includes(part))
  unmount()
  return { attrs, hasChosenOption, strayStates }
}

/** What a block draws over all its designs and states. */
function drawnByBlock(blockId: string): Drawn & { perDesign: Map<string, Set<string>> } {
  const all: Drawn = { attrs: new Set(), hasChosenOption: false, strayStates: [] }
  const perDesign = new Map<string, Set<string>>()
  for (const design of designsOf(blockId)) {
    const inDesign = new Set<string>()
    for (const scenario of SCENARIOS[blockId] ?? [{ name: 'sample' }]) {
      const drawn = drawnParts(blockId, design, scenario)
      drawn.attrs.forEach((a) => {
        all.attrs.add(a)
        inDesign.add(a)
      })
      all.hasChosenOption ||= drawn.hasChosenOption
      all.strayStates.push(...drawn.strayStates)
    }
    perDesign.set(design ?? 'standard', inDesign)
  }
  return { ...all, perDesign }
}

describe('checkout block registry parts', () => {
  it('lists only known, non-shared parts, each once, with option_on/option_hover beside option', () => {
    const ids = new Set<string>(PARTS.map((p) => p.id))
    for (const def of CHECKOUT_BLOCKS) {
      const parts = def.parts ?? []
      expect(new Set(parts).size).toBe(parts.length)
      for (const part of parts) {
        expect(ids.has(part)).toBe(true)
        expect(SHARED_PARTS as readonly string[]).not.toContain(part)
      }
      if (parts.includes('option')) expect(parts).toEqual(expect.arrayContaining(['option_on', 'option_hover']))
      if (parts.includes('icon') && parts.includes('option')) expect(parts).toContain('icon_on')
    }
  })
})

describe.each(CHECKOUT_BLOCKS.map((def) => [def.id, def] as const))('%s', (blockId, def) => {
  let drawn: ReturnType<typeof drawnByBlock>
  beforeAll(() => {
    drawn = drawnByBlock(blockId)
  })
  const listed = (def.parts ?? []).filter((part) => !STATE_PARTS.has(part))

  it('draws every part it lists', () => {
    const missing = listed.filter((part) => !drawn.attrs.has(attrOf(part)))
    expect(missing).toEqual([])
  })

  it('marks the chosen option when it lists one', () => {
    expect(drawn.hasChosenOption).toBe((def.parts ?? []).includes('option_on'))
  })

  it('marks only parts the engine knows and the block lists', () => {
    const allowed = new Set([...SHARED_PARTS, ...listed].map(attrOf))
    const unknown = [...drawn.attrs].filter((attr) => !KNOWN_ATTRS.has(attr))
    const unlisted = [...drawn.attrs].filter((attr) => KNOWN_ATTRS.has(attr) && !allowed.has(attr))
    expect({ unknown, unlisted }).toEqual({ unknown: [], unlisted: [] })
  })

  it('puts the chosen state only on options, icons and steps', () => {
    expect(drawn.strayStates).toEqual([])
  })

  if ((def.parts ?? []).includes('option')) {
    it('marks its options in every design', () => {
      const without = [...drawn.perDesign.entries()].filter(([, attrs]) => !attrs.has('option')).map(([design]) => design)
      expect(without).toEqual([])
    })
  }
})
