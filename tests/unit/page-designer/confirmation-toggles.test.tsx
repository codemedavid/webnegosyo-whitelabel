/**
 * Thank-you page show toggles (Page Designer v3, "Show toggles added"). Each
 * switch, turned off, hides exactly its part in every design of its block;
 * left at its default the block renders exactly as a block that never had
 * the setting. Failure help is never a switch, and a failed save keeps the
 * Messenger copy link and order message box whatever the switches say.
 */

import { render } from '@testing-library/react'

import { ConfirmationBlocksProvider, type ConfirmationBlocksValue } from '@/components/page-designer/confirmation/confirmation-context'
import { CONFIRMATION_LIVE_BLOCKS } from '@/components/page-designer/confirmation/live-blocks'
import { sampleConfirmationValue } from '@/components/page-designer/confirmation/sample-order'
import { CONFIRMATION_BLOCKS } from '@/lib/page-designer/blocks-confirmation'
import type { BlockOptionValue, PageBlockDef } from '@/lib/page-designer/types'

import { all, blockProps, both, byText, designsOf, signature, withoutPart, type PartPicker } from '../../utils/part-toggles'

const inert = (): void => undefined

/** The sample order with every optional line showing: a schedule, both fees, the message open. */
function scenario(isFailed = false, extra: Partial<ConfirmationBlocksValue> = {}): ConfirmationBlocksValue {
  const base = sampleConfirmationValue('Lola’s Kitchen', isFailed)
  return {
    ...base,
    order: { ...base.order, scheduledForLabel: 'Today, 6:30 PM', deliveryFee: 50, serviceChargeAmount: 20 },
    isMessageExpanded: true,
    ...extra,
  }
}

const SENT = scenario()
const COUNTING = scenario(false, { trackingCountdown: 3, onStayHere: inert })

const defOf = (id: string): PageBlockDef => {
  const def = CONFIRMATION_BLOCKS.find((d) => d.id === id)
  if (!def) throw new Error(`no block ${id}`)
  return def
}

function renderBlock(
  def: PageBlockDef,
  variant: string | undefined,
  value: ConfirmationBlocksValue,
  overrides: Readonly<Record<string, BlockOptionValue>> = {},
  bare = false,
): HTMLElement {
  const Live = CONFIRMATION_LIVE_BLOCKS[def.id]!
  const { container, unmount } = render(
    <ConfirmationBlocksProvider value={value}>
      <Live {...blockProps(def, variant, overrides, bare)} />
    </ConfirmationBlocksProvider>,
  )
  const copy = container.cloneNode(true) as HTMLElement
  unmount()
  return copy
}

/** A fee row: its label's row. */
const feeRow = (label: string): PartPicker => byText('span[data-part="muted"]', label, (el) => el.parentElement!)

interface ToggleCase {
  block: string
  key: string
  pick: PartPicker
  value?: ConfirmationBlocksValue
}

const CASES: readonly ToggleCase[] = [
  { block: 'confirmation.summary', key: 'show_scheduled', pick: byText('[data-part="badge"]', 'Scheduled for') },
  { block: 'confirmation.summary', key: 'show_addons', pick: byText('p[data-part="muted"]', 'Add-ons:') },
  { block: 'confirmation.summary', key: 'show_notes', pick: byText('p[data-part="muted"]', 'Note:') },
  { block: 'confirmation.summary', key: 'show_fees', pick: both(feeRow('Delivery Fee'), feeRow('Service Charge')) },
  {
    block: 'confirmation.messenger',
    key: 'show_or_line',
    pick: (root) =>
      Array.from(root.querySelectorAll('span[data-part="muted"]'))
        .filter((el) => el.textContent === 'or')
        .map((el) => el.parentElement!),
  },
  { block: 'confirmation.messenger', key: 'show_copy_link', pick: byText('button[data-part="link"]', 'Copy order text') },
  {
    block: 'confirmation.messenger',
    key: 'show_message_box',
    pick: byText('h2[data-part="title"]', 'Order Message', (el) => el.closest('[data-part="card"]')!),
  },
  { block: 'confirmation.actions', key: 'show_track_button', pick: byText('button[data-part="button"]', 'Track Your Order') },
  {
    block: 'confirmation.actions',
    key: 'show_track_button',
    pick: byText('button[data-part="button"]', 'Track Your Order'),
    value: COUNTING,
  },
]

describe('thank-you show toggles', () => {
  it.each(CASES.map((c) => [c.block, c.key, c] as const))('%s %s off hides exactly its part', (_block, _key, c) => {
    const def = defOf(c.block)
    expect(def.options.find((o) => o.key === c.key)).toMatchObject({ type: 'boolean', default: true, group: 'options' })
    for (const variant of designsOf(def)) {
      const value = c.value ?? SENT
      const on = renderBlock(def, variant, value)
      const off = renderBlock(def, variant, value, { [c.key]: false })
      const { stripped, removed } = withoutPart(on, c.pick)
      expect(removed).toBeGreaterThan(0)
      expect(c.pick(off)).toHaveLength(0)
      expect(signature(off)).toBe(signature(stripped))
    }
  })

  it('every new switch is a labelled boolean in Settings that starts on', () => {
    const keys: Record<string, readonly string[]> = {
      'confirmation.summary': ['show_scheduled', 'show_addons', 'show_notes', 'show_fees'],
      'confirmation.messenger': ['show_or_line', 'show_copy_link', 'show_message_box'],
      'confirmation.actions': ['show_track_button'],
    }
    for (const [block, list] of Object.entries(keys)) {
      for (const key of list) {
        const option = defOf(block).options.find((o) => o.key === key)
        expect(option).toMatchObject({ type: 'boolean', default: true, group: 'options' })
        expect(option?.label.length).toBeGreaterThan(0)
      }
    }
  })

  it('the failure help shows with every status switch off', () => {
    const status = defOf('confirmation.status')
    const allOff = Object.fromEntries(status.options.filter((o) => o.type === 'boolean').map((o) => [o.key, false]))
    for (const variant of designsOf(status)) {
      const root = renderBlock(status, variant, scenario(true), allOff)
      expect(root.querySelectorAll('[role="alert"]')).toHaveLength(1)
    }
  })

  it('a failed save keeps the copy link and the order message box', () => {
    const def = defOf('confirmation.messenger')
    const failed = scenario(true)
    const off = { show_copy_link: false, show_message_box: false } as const
    const on = renderBlock(def, undefined, failed)
    const hidden = renderBlock(def, undefined, failed, off)
    expect(signature(hidden)).toBe(signature(on))
    expect(byText('button[data-part="link"]', 'Copy order text')(hidden)).toHaveLength(1)
    expect(byText('h2[data-part="title"]', 'Order Message')(hidden)).toHaveLength(1)
  })

  it('a kiosk ignores the Track button switch (it has its own card)', () => {
    const def = defOf('confirmation.actions')
    const kiosk = scenario(false, { isKiosk: true, kioskCountdown: 4 })
    const on = renderBlock(def, undefined, kiosk)
    const off = renderBlock(def, undefined, kiosk, { show_track_button: false })
    expect(off.innerHTML).toBe(on.innerHTML)
    expect(byText('button[data-part="button"]', 'Start a New Order')(off)).toHaveLength(1)
  })

  it('side by side with only Back left drops to one column', () => {
    const def = defOf('confirmation.actions')
    const off = renderBlock(def, 'side', SENT, { show_track_button: false })
    expect(all('.grid-cols-1')(off)).toHaveLength(1)
    expect(all('.grid-cols-2')(off)).toHaveLength(0)
  })

  describe('defaults render exactly as a block without the settings', () => {
    const values: readonly ConfirmationBlocksValue[] = [SENT, COUNTING, scenario(true), scenario(false, { isKiosk: true, kioskCountdown: 4 })]
    it.each(CONFIRMATION_BLOCKS.map((def) => [def.id, def] as const))('%s', (_id, def) => {
      for (const variant of designsOf(def)) {
        for (const value of values) {
          expect(renderBlock(def, variant, value).innerHTML).toBe(renderBlock(def, variant, value, {}, true).innerHTML)
        }
      }
    })
  })
})
