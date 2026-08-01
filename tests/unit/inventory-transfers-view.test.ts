/**
 * What a transfer looks like on a screen, and which button the account looking
 * at it may press.
 *
 * The service already refuses the wrong account (`canSendTransfer` /
 * `canReceiveTransfer`). This decides what to *offer*, which is a different
 * question: a button that throws when pressed is a worse answer than no button,
 * because the merchant learns the rule by being refused instead of by looking.
 * Both must agree, so both are driven from the same two predicates.
 */

import {
  describeTransfer,
  groupTransfers,
  transferDirection,
  type TransferListItem,
} from '@/lib/inventory/transfers-view'
import type { BranchScope } from '@/lib/outlets/branch-scope'

const NORTH = 'o-north'
const SOUTH = 'o-south'

const BRANCHES = [
  { id: NORTH, name: 'North' },
  { id: SOUTH, name: 'South' },
]

const OWNER: BranchScope = { kind: 'all' }
const AT_NORTH: BranchScope = { kind: 'branch', outletId: NORTH }
const AT_SOUTH: BranchScope = { kind: 'branch', outletId: SOUTH }

const transfer = (over: Partial<TransferListItem> = {}): TransferListItem => ({
  id: 'xfer-1',
  status: 'draft',
  fromOutletId: NORTH,
  toOutletId: SOUTH,
  createdAt: '2026-07-30T01:00:00.000Z',
  lines: [{ inventoryItemId: 'item-flour', name: 'Flour', unit: 'g', sentQuantity: 500 }],
  ...over,
})

describe('transferDirection', () => {
  it('names both ends the way the merchant knows them', () => {
    expect(transferDirection(transfer(), BRANCHES)).toEqual({ from: 'North', to: 'South' })
  })

  it('names the unbranched pool rather than leaving an end blank', () => {
    // A blank end reads as a broken record. The pool is a real place stock sits
    // for a tenant that switched branches on after it had stock.
    expect(transferDirection(transfer({ fromOutletId: null }), BRANCHES)).toEqual({
      from: 'Store pool',
      to: 'South',
    })
  })

  it('falls back to a neutral label for a branch that has since been removed', () => {
    expect(transferDirection(transfer({ toOutletId: 'o-gone' }), BRANCHES).to).toBe('Former branch')
  })
})

describe('describeTransfer — what the owner may do', () => {
  it('lets the owner send a draft', () => {
    expect(describeTransfer(transfer(), OWNER, BRANCHES).actions).toContain('send')
  })

  it('lets the owner cancel a draft', () => {
    expect(describeTransfer(transfer(), OWNER, BRANCHES).actions).toContain('cancel')
  })

  it('offers receiving on a sent transfer and nothing else', () => {
    const view = describeTransfer(transfer({ status: 'sent' }), OWNER, BRANCHES)
    expect(view.actions).toEqual(['receive'])
  })

  it('offers nothing once it has been received', () => {
    expect(describeTransfer(transfer({ status: 'received' }), OWNER, BRANCHES).actions).toEqual([])
  })

  it('offers nothing on a cancelled transfer', () => {
    expect(describeTransfer(transfer({ status: 'cancelled' }), OWNER, BRANCHES).actions).toEqual([])
  })
})

describe('describeTransfer — what a branch may do', () => {
  it('lets the sending branch send its own draft', () => {
    expect(describeTransfer(transfer(), AT_NORTH, BRANCHES).actions).toContain('send')
  })

  it('does not offer the destination a way to send its own delivery', () => {
    // The one thing the document exists to prevent: a sender declaring their
    // own delivery complete makes every shortfall unfindable.
    expect(describeTransfer(transfer(), AT_SOUTH, BRANCHES).actions).toEqual([])
  })

  it('lets only the destination count a delivery in', () => {
    const sent = transfer({ status: 'sent' })
    expect(describeTransfer(sent, AT_SOUTH, BRANCHES).actions).toEqual(['receive'])
    expect(describeTransfer(sent, AT_NORTH, BRANCHES).actions).toEqual([])
  })

  it('offers a branch no way to send the unbranched pool', () => {
    const fromPool = transfer({ fromOutletId: null })
    expect(describeTransfer(fromPool, AT_NORTH, BRANCHES).actions).toEqual([])
  })
})

describe('describeTransfer — the summary line', () => {
  it('reads the status back in the merchant’s words', () => {
    expect(describeTransfer(transfer({ status: 'sent' }), OWNER, BRANCHES).statusLabel).toBe(
      'In transit',
    )
  })

  it('counts the ingredients on the transfer', () => {
    const two = transfer({
      lines: [
        { inventoryItemId: 'a', name: 'Flour', unit: 'g', sentQuantity: 500 },
        { inventoryItemId: 'b', name: 'Sugar', unit: 'g', sentQuantity: 200 },
      ],
    })
    expect(describeTransfer(two, OWNER, BRANCHES).itemCount).toBe(2)
  })

  it('flags stock that is on neither shelf', () => {
    // The whole reason "what is in transit?" needs an answer: this stock has
    // left one branch and not arrived at the other.
    expect(describeTransfer(transfer({ status: 'sent' }), OWNER, BRANCHES).isInTransit).toBe(true)
    expect(describeTransfer(transfer(), OWNER, BRANCHES).isInTransit).toBe(false)
  })

  it('reports a shortfall against a received transfer', () => {
    const short = transfer({
      status: 'received',
      lines: [
        { inventoryItemId: 'a', name: 'Flour', unit: 'g', sentQuantity: 500, receivedQuantity: 480 },
      ],
    })
    expect(describeTransfer(short, OWNER, BRANCHES).shortfallCount).toBe(1)
  })

  it('reports no shortfall when everything arrived', () => {
    const clean = transfer({
      status: 'received',
      lines: [
        { inventoryItemId: 'a', name: 'Flour', unit: 'g', sentQuantity: 500, receivedQuantity: 500 },
      ],
    })
    expect(describeTransfer(clean, OWNER, BRANCHES).shortfallCount).toBe(0)
  })
})

describe('groupTransfers', () => {
  it('puts what is in transit first — it is the only urgent group', () => {
    const groups = groupTransfers(
      [transfer({ id: 'a' }), transfer({ id: 'b', status: 'sent' })],
      OWNER,
      BRANCHES,
    )
    expect(groups.inTransit.map((t) => t.id)).toEqual(['b'])
    expect(groups.drafts.map((t) => t.id)).toEqual(['a'])
  })

  it('keeps finished transfers out of the working lists', () => {
    const groups = groupTransfers(
      [transfer({ id: 'c', status: 'received' }), transfer({ id: 'd', status: 'cancelled' })],
      OWNER,
      BRANCHES,
    )
    expect(groups.inTransit).toHaveLength(0)
    expect(groups.drafts).toHaveLength(0)
    expect(groups.history.map((t) => t.id)).toEqual(['c', 'd'])
  })

  it('shows the newest first, so the transfer just raised is at the top', () => {
    const groups = groupTransfers(
      [
        transfer({ id: 'old', createdAt: '2026-07-01T00:00:00.000Z' }),
        transfer({ id: 'new', createdAt: '2026-07-29T00:00:00.000Z' }),
      ],
      OWNER,
      BRANCHES,
    )
    expect(groups.drafts.map((t) => t.id)).toEqual(['new', 'old'])
  })

  it('does not mutate the list it was given', () => {
    const list = [
      transfer({ id: 'old', createdAt: '2026-07-01T00:00:00.000Z' }),
      transfer({ id: 'new', createdAt: '2026-07-29T00:00:00.000Z' }),
    ]
    groupTransfers(list, OWNER, BRANCHES)
    expect(list.map((t) => t.id)).toEqual(['old', 'new'])
  })
})
