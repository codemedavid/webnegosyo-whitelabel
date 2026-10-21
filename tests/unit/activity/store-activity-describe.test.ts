import { describeActivity, actorFirstName } from '@/lib/activity/describe'
import type { StoreActivityEvent } from '@/lib/activity/store-event'
import { categoryOfKind, isRoutineKind, type ActivityKind } from '@/lib/activity/taxonomy'

const MINUS = '−'

function event(kind: ActivityKind, patch: Partial<StoreActivityEvent> = {}): StoreActivityEvent {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    outletId: null,
    outletName: null,
    occurredAt: '2026-10-12T04:33:00.000Z',
    category: categoryOfKind(kind),
    kind,
    isRoutine: isRoutineKind(kind),
    actorUserId: 'u1',
    actorName: 'Ana Reyes',
    approvedByName: null,
    amount: null,
    quantity: null,
    unit: null,
    reason: null,
    note: null,
    subjectType: 'order',
    subjectRef: 'o1',
    orderNumber: '#14',
    before: null,
    after: null,
    summary: {},
    flags: [],
    reviewedAt: null,
    reviewedByName: null,
    ...patch,
  }
}

describe('actorFirstName', () => {
  it('uses the first name, also from an email local part', () => {
    expect(actorFirstName('Ana Reyes')).toBe('Ana')
    expect(actorFirstName('ana.reyes')).toBe('Ana')
    expect(actorFirstName('  marco_s ')).toBe('Marco')
    expect(actorFirstName(null)).toBeNull()
  })
})

describe('describeActivity — money', () => {
  it('reads like the contract example, two names on a money decision', () => {
    const described = describeActivity(
      event('refund.issued', {
        amount: -185,
        reason: 'Wrong item served',
        approvedByName: 'Marco Santos',
        summary: { refundNumber: 'R-0042' },
      }),
    )
    expect(described).toEqual({
      title: 'Ana refunded #14 · R-0042',
      subtitle: 'Wrong item served · approved by Marco',
      amountLabel: `${MINUS}₱185`,
      tone: 'negative',
      icon: 'refund',
    })
  })

  it('separates statutory discounts from manual ones', () => {
    expect(describeActivity(event('discount.applied', { amount: -20, summary: { statutory: true, discountKind: 'senior' } })).title)
      .toBe('Ana gave a Senior discount on #14')
    expect(describeActivity(event('discount.applied', { amount: -20, summary: { statutory: true } })).title)
      .toBe('Ana gave a Senior/PWD discount on #14')
    expect(describeActivity(event('discount.applied', { amount: -40, summary: { statutory: false } })).title)
      .toBe('Ana gave a discount on #14')
  })

  it('signs money in with + and shows payment kinds', () => {
    const described = describeActivity(event('payment.recorded', { amount: 310, summary: { paymentMethod: 'GCash' } }))
    expect(described.title).toBe('Ana recorded a payment on #14')
    expect(described.subtitle).toBe('GCash')
    expect(described.amountLabel).toBe('+₱310')
    expect(described.tone).toBe('positive')
  })
})

describe('describeActivity — orders', () => {
  it('names the actor, or says it happened', () => {
    expect(describeActivity(event('order.cancelled', { amount: 310 })).title).toBe('Ana cancelled #14')
    expect(describeActivity(event('order.cancelled', { actorName: null, actorUserId: null })).title).toBe('#14 was cancelled')
  })

  it('shows an order total unsigned (no money moved by a cancel)', () => {
    expect(describeActivity(event('order.cancelled', { amount: 310 })).amountLabel).toBe('₱310')
  })

  it('separates a register sale from an online order', () => {
    expect(describeActivity(event('order.placed')).title).toBe('Ana rang up #14')
    expect(describeActivity(event('order.placed', { actorName: null, actorUserId: null })).title).toBe('New order #14')
  })

  it('uses the new status word', () => {
    expect(describeActivity(event('order.status_changed', { after: { status: 'ready' } })).title).toBe('Ana marked #14 ready')
    expect(describeActivity(event('order.completed')).title).toBe('Ana completed #14')
  })

  it('lists removed items on an edit when there is no reason', () => {
    const described = describeActivity(event('order.edited', {
      amount: -185,
      summary: { removed: [{ name: 'Chicken Sisig', quantity: 1 }] },
    }))
    expect(described.title).toBe('Ana edited #14')
    expect(described.subtitle).toBe(`${MINUS}1 Chicken Sisig`)
    expect(described.amountLabel).toBe(`${MINUS}₱185`)
  })

  it('counts bulk deletes', () => {
    expect(describeActivity(event('order.deleted', { quantity: 17, orderNumber: null, summary: { action: 'deleted' } })).title)
      .toBe('Ana deleted 17 orders')
  })
})

describe('describeActivity — cash, stock, menu, team', () => {
  it('says how the drawer closed', () => {
    const described = describeActivity(event('shift.closed', { amount: -150, orderNumber: null }))
    expect(described.title).toBe('Ana closed a shift')
    expect(described.subtitle).toBe('Drawer short ₱150')
    expect(described.amountLabel).toBe(`${MINUS}₱150`)
    expect(describeActivity(event('shift.closed', { amount: 0, orderNumber: null })).subtitle).toBe('Drawer exact')
  })

  it('describes a write-off with quantity, unit and item', () => {
    const described = describeActivity(event('stock.wasted', {
      amount: -100, quantity: -2, unit: 'kg', note: 'Dropped', orderNumber: null, summary: { itemName: 'Pork' },
    }))
    expect(described.title).toBe('Ana wrote off 2 kg Pork')
    expect(described.subtitle).toBe('Dropped')
    expect(described.tone).toBe('negative')
    expect(described.icon).toBe('stock')
  })

  it('shows a price change as before → after', () => {
    const described = describeActivity(event('menu.price_changed', {
      amount: 10, orderNumber: null, before: { price: 185 }, after: { price: 195 }, summary: { itemName: 'Sisig' },
    }))
    expect(described.title).toBe("Ana changed Sisig's price")
    expect(described.subtitle).toBe('₱185 → ₱195')
    expect(described.amountLabel).toBe('+₱10')
  })

  it('uses the stored sentence for settings, with who did it', () => {
    const described = describeActivity(event('settings.changed', {
      actorName: 'Lorna Cruz', orderNumber: null, summary: { title: 'Lalamove delivery turned on' },
    }))
    expect(described.title).toBe('Lalamove delivery turned on')
    expect(described.subtitle).toBe('by Lorna')
    expect(described.icon).toBe('team')
  })

  it('falls back to the stored title for system events', () => {
    const described = describeActivity(event('stock.alert', {
      actorName: null, actorUserId: null, orderNumber: null, summary: { title: 'Pork ran out' },
    }))
    expect(described.title).toBe('Pork ran out')
    expect(described.tone).toBe('warning')
  })

  it('adds the branch only when asked', () => {
    const base = event('cash.pay_out', { amount: -200, reason: 'Ice', outletName: 'Makati', orderNumber: null })
    expect(describeActivity(base).subtitle).toBe('Ice')
    expect(describeActivity(base, { showBranch: true }).subtitle).toBe('Ice · Makati')
    expect(describeActivity(base).title).toBe('Ana took cash out of the drawer')
  })

  it('never puts flags in the sentence (P8: describe the event, not the person)', () => {
    const flagged = describeActivity(event('order.cancelled', { amount: 310, flags: ['repeat_cancels', 'paid_then_cancelled'] }))
    expect(flagged.title).toBe('Ana cancelled #14')
    expect(flagged.subtitle).toBe('')
  })
})

describe('expenses (docs/plans/expenses/contract.md §6)', () => {
  it('names who recorded an expense and what it was for', () => {
    const described = describeActivity(event('expense.recorded', {
      amount: -1250, note: 'Petron', subjectType: 'expense', orderNumber: null,
      summary: { title: 'Recorded an expense: Gas / LPG ₱1,250', categoryName: 'Gas / LPG' },
    }))
    expect(described).toEqual({
      title: 'Ana recorded an expense: Gas / LPG',
      subtitle: 'Petron',
      amountLabel: `${MINUS}₱1,250`,
      tone: 'negative',
      icon: 'money',
    })
  })

  it('shows a void with its reason and the money back in the books', () => {
    const described = describeActivity(event('expense.voided', {
      amount: 1250, reason: 'wrong category', subjectType: 'expense', orderNumber: null,
      summary: { categoryName: 'Gas / LPG' },
    }))
    expect(described.title).toBe('Ana voided an expense: Gas / LPG')
    expect(described.subtitle).toBe('wrong category')
    expect(described.amountLabel).toBe('+₱1,250')
    expect(described.icon).toBe('cancel')
  })
})
