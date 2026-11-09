/**
 * @jest-environment node
 *
 * What a register may ask the stock route to spend or return: only what the
 * order the server holds (now, or at some earlier edit) could account for.
 */
import {
  checkDepleteLines,
  checkReviseLines,
  type OrderLineEvidence,
} from '@/lib/inventory/order-stock-lines'

const line = (menuItemId: string, quantity: number, extra: Record<string, unknown> = {}) => ({
  menuItemId, quantity, optionIds: [], modifierOptionIds: [], addonIds: [], ...extra,
})

const totals = (entries: Array<[string, number]>) => new Map(entries)

function evidence(overrides: Partial<OrderLineEvidence> = {}): OrderLineEvidence {
  return {
    current: totals([['latte', 2], ['bun', 1]]),
    revisionNumber: 0,
    revisions: new Map(),
    hasRevisionHistory: true,
    selectionIds: new Map(),
    menuOptionIds: new Map(),
    ...overrides,
  }
}

describe('checkDepleteLines', () => {
  test('accepts the lines the order holds', () => {
    const verdict = checkDepleteLines([line('latte', 2), line('bun', 1)], evidence())
    expect(verdict.ok).toBe(true)
  })

  test('accepts a dish split over several configurations that sum to the order', () => {
    const verdict = checkDepleteLines([line('latte', 1), line('latte', 1)], evidence())
    expect(verdict.ok).toBe(true)
  })

  test('refuses a dish that is not on the order', () => {
    const verdict = checkDepleteLines([line('steak', 1)], evidence())
    expect(verdict).toEqual({ ok: false, code: 'lines_do_not_match_order' })
  })

  test('refuses more of a dish than the order holds', () => {
    const verdict = checkDepleteLines([line('latte', 3)], evidence())
    expect(verdict).toEqual({ ok: false, code: 'lines_do_not_match_order' })
  })

  test('a late deplete after an edit may still name what the order held before', () => {
    const verdict = checkDepleteLines([line('bun', 3)], evidence({
      current: totals([['latte', 2]]),
      revisionNumber: 1,
      revisions: new Map([[1, { before: totals([['bun', 3]]), after: totals([['latte', 2]]) }]]),
    }))
    expect(verdict.ok).toBe(true)
  })

  test('ignores a line with no dish id (a deleted menu item spends nothing)', () => {
    const verdict = checkDepleteLines([line('', 4), line('latte', 1)], evidence())
    expect(verdict.ok).toBe(true)
  })

  test('cannot check an edited order whose history the backend does not keep', () => {
    const verdict = checkDepleteLines([line('bun', 9)], evidence({ revisionNumber: 2, hasRevisionHistory: false }))
    expect(verdict.ok).toBe(true)
  })

  test('drops option ids the dish does not have, keeping the rest of the line', () => {
    const verdict = checkDepleteLines(
      [line('latte', 1, { optionIds: ['large', 'made-up'], addonIds: ['shot', 'fake'], modifierOptionIds: ['large', 'made-up', 'shot', 'fake'], addonQuantities: { shot: 2, fake: 5 } })],
      evidence({ menuOptionIds: new Map([['latte', new Set(['large', 'shot'])]]) }),
    )
    expect(verdict).toEqual({
      ok: true,
      lines: [line('latte', 1, { optionIds: ['large'], addonIds: ['shot'], modifierOptionIds: ['large', 'shot'], addonQuantities: { shot: 2 } })],
    })
  })

  test('keeps an option the order snapshot recorded even if the menu no longer lists it', () => {
    const verdict = checkDepleteLines(
      [line('latte', 1, { optionIds: ['old'], modifierOptionIds: ['old'] })],
      evidence({ menuOptionIds: new Map([['latte', new Set(['large'])]]), selectionIds: new Map([['latte', new Set(['old'])]]) }),
    )
    expect(verdict).toMatchObject({ ok: true, lines: [{ optionIds: ['old'] }] })
  })
})

describe('checkReviseLines', () => {
  const revisions = new Map([[2, { before: totals([['latte', 1], ['bun', 2]]), after: totals([['latte', 2], ['bun', 1]]) }]])
  const base = { revisionNumber: 3, revisions }

  test('accepts the netted difference of that revision', () => {
    const verdict = checkReviseLines(2, [line('latte', 1)], [line('bun', 1)], evidence(base))
    expect(verdict.ok).toBe(true)
  })

  test('accepts a configuration swap that nets to nothing for the dish', () => {
    const swap = new Map([[1, { before: totals([['latte', 1]]), after: totals([['latte', 1]]) }]])
    const verdict = checkReviseLines(1, [line('latte', 1, { optionIds: ['small'] })], [line('latte', 1, { optionIds: ['large'] })], evidence({ revisions: swap, revisionNumber: 1 }))
    expect(verdict.ok).toBe(true)
  })

  test('refuses a revision the order has not reached', () => {
    const verdict = checkReviseLines(4, [line('latte', 1)], [], evidence(base))
    expect(verdict).toEqual({ ok: false, code: 'revision_not_on_order' })
  })

  test('refuses a revision with no recorded edit', () => {
    const verdict = checkReviseLines(1, [line('latte', 1)], [], evidence(base))
    expect(verdict).toEqual({ ok: false, code: 'revision_not_on_order' })
  })

  test('refuses stock invented by an edit that did not add it', () => {
    const verdict = checkReviseLines(2, [line('latte', 5)], [], evidence(base))
    expect(verdict).toEqual({ ok: false, code: 'lines_do_not_match_order' })
  })

  test('refuses stock returned that the edit did not remove', () => {
    const verdict = checkReviseLines(2, [], [line('latte', 1)], evidence(base))
    expect(verdict).toEqual({ ok: false, code: 'lines_do_not_match_order' })
  })

  test('refuses a dish the edit never touched', () => {
    const verdict = checkReviseLines(2, [line('steak', 1)], [], evidence(base))
    expect(verdict).toEqual({ ok: false, code: 'lines_do_not_match_order' })
  })

  test('without edit history only the revision number can be bounded', () => {
    expect(checkReviseLines(2, [line('x', 1)], [], evidence({ revisionNumber: 2, hasRevisionHistory: false })).ok).toBe(true)
    expect(checkReviseLines(3, [line('x', 1)], [], evidence({ revisionNumber: 2, hasRevisionHistory: false }))).toEqual({ ok: false, code: 'revision_not_on_order' })
  })
})
