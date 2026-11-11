import {
  DEFAULT_NO_RECEIPT_THRESHOLD_CENTS,
  computeFlags,
  computeFlagsForAll,
  needsALook,
} from '@/lib/expenses/flags'
import type { Expense } from '@/lib/expenses/types'
import { makeExpense, seededCategories } from './engine-fixtures'

const categories = seededCategories()

function flagsOf(expense: Expense, others: Expense[] = [], threshold?: number | null) {
  return computeFlags(expense, {
    categories,
    others,
    ...(threshold === undefined ? {} : { noReceiptThresholdCents: threshold }),
  })
}

describe('no_receipt', () => {
  it('flags a recorded expense of ₱1,000 or more with no photo', () => {
    expect(DEFAULT_NO_RECEIPT_THRESHOLD_CENTS).toBe(100_000)
    expect(flagsOf(makeExpense({ amountCents: 100_000 }))).toEqual(['no_receipt'])
    expect(flagsOf(makeExpense({ amountCents: 99_999 }))).toEqual([])
    expect(flagsOf(makeExpense({ amountCents: 100_000, receiptCount: 1 }))).toEqual([])
  })

  it('follows the store threshold, and null switches it off', () => {
    expect(flagsOf(makeExpense({ amountCents: 50_000 }), [], 50_000)).toEqual(['no_receipt'])
    expect(flagsOf(makeExpense({ amountCents: 5_000_000 }), [], null)).toEqual([])
  })

  it('does not flag a void row', () => {
    const voided = makeExpense({ amountCents: 200_000, status: 'void', voidReason: 'x', voidedAt: '2026-10-21T03:00:00Z' })
    expect(flagsOf(voided)).toEqual([])
  })
})

describe('possible_duplicate', () => {
  it('matches the same supplier and invoice number (normalised)', () => {
    const a = makeExpense({ supplierId: 'sup-1', invoiceNo: 'SI 0012', amountCents: 50_000, categoryId: 'cat-ice' })
    const b = makeExpense({ supplierId: 'sup-1', invoiceNo: 'si-0012', amountCents: 70_000, categoryId: 'cat-lpg', spentOn: '2026-09-01' })
    expect(flagsOf(a, [a, b])).toEqual(['possible_duplicate'])
  })

  it('matches a typed payee name when there is no supplier record', () => {
    const a = makeExpense({ paidToName: ' Aling Nena ', invoiceNo: '55', categoryId: 'cat-ice' })
    const b = makeExpense({ paidToName: 'aling nena', invoiceNo: '55', categoryId: 'cat-lpg', amountCents: 1 })
    expect(flagsOf(a, [b])).toEqual(['possible_duplicate'])
  })

  it('needs both a supplier and an invoice number to match on the invoice rule', () => {
    const a = makeExpense({ supplierId: 'sup-1', invoiceNo: null, categoryId: 'cat-ice' })
    const b = makeExpense({ supplierId: 'sup-1', invoiceNo: null, categoryId: 'cat-lpg', amountCents: 1 })
    const c = makeExpense({ supplierId: 'sup-2', invoiceNo: '9', categoryId: 'cat-lpg', amountCents: 2 })
    const d = makeExpense({ supplierId: 'sup-1', invoiceNo: '9', categoryId: 'cat-water', amountCents: 3 })
    expect(flagsOf(a, [b])).toEqual([])
    expect(flagsOf(d, [c])).toEqual([])
    const e = makeExpense({ invoiceNo: '9', categoryId: 'cat-water', amountCents: 4 })
    const f = makeExpense({ invoiceNo: '9', categoryId: 'cat-rent', amountCents: 5 })
    expect(flagsOf(e, [f])).toEqual([])
  })

  it('matches the same amount and category within 2 days either side', () => {
    const base = makeExpense({ amountCents: 12_000, categoryId: 'cat-ice', spentOn: '2026-10-21' })
    const twoDays = makeExpense({ amountCents: 12_000, categoryId: 'cat-ice', spentOn: '2026-10-19' })
    const threeDays = makeExpense({ amountCents: 12_000, categoryId: 'cat-ice', spentOn: '2026-10-18' })
    const later = makeExpense({ amountCents: 12_000, categoryId: 'cat-ice', spentOn: '2026-10-23' })
    const otherCategory = makeExpense({ amountCents: 12_000, categoryId: 'cat-lpg', spentOn: '2026-10-21' })
    expect(flagsOf(base, [twoDays])).toEqual(['possible_duplicate'])
    expect(flagsOf(base, [later])).toEqual(['possible_duplicate'])
    expect(flagsOf(base, [threeDays, otherCategory])).toEqual([])
  })

  it('ignores itself, void rows and its own replacement chain', () => {
    const original = makeExpense({
      id: 'e-1',
      status: 'void',
      voidReason: 'wrong amount',
      voidedAt: '2026-10-21T03:00:00Z',
    })
    const replacement = makeExpense({ id: 'e-2', replacesExpenseId: 'e-1', status: 'void', voidReason: 'again', voidedAt: '2026-10-21T04:00:00Z' })
    const third = makeExpense({ id: 'e-3', replacesExpenseId: 'e-2' })
    // A recorded twin elsewhere in the chain (data the RPC should never make) is still the same spend.
    const chainTwin = makeExpense({ id: 'e-4', replacesExpenseId: 'e-3' })
    const before = makeExpense({ id: 'e-0' })
    const withPredecessor = { ...original, replacesExpenseId: 'e-0', status: 'void' as const }
    expect(flagsOf(third, [withPredecessor, replacement, third, chainTwin, before])).toEqual([])
    expect(flagsOf(third, [original, replacement, third])).toEqual([])
  })

  it('flags only recorded rows', () => {
    const voided = makeExpense({ status: 'void', voidReason: 'x', voidedAt: '2026-10-21T03:00:00Z' })
    expect(flagsOf(voided, [makeExpense()])).toEqual([])
  })
})

describe('round_other', () => {
  const other = (amountCents: number) => makeExpense({ categoryId: 'cat-other', amountCents, note: 'misc' })

  it('flags a round ₱100 multiple of ₱500 or more in Other', () => {
    expect(flagsOf(other(50_000))).toEqual(['round_other'])
    expect(flagsOf(other(120_000))).toEqual(['round_other', 'no_receipt'].sort(byFlagOrder))
    expect(flagsOf(other(40_000))).toEqual([])
    expect(flagsOf(other(55_050))).toEqual([])
    expect(flagsOf(other(55_500))).toEqual([])
  })

  it('only in the Other category', () => {
    expect(flagsOf(makeExpense({ categoryId: 'cat-rent', amountCents: 50_000 }))).toEqual([])
    expect(flagsOf(makeExpense({ categoryId: 'cat-unknown', amountCents: 50_000 }))).toEqual([])
  })
})

describe('after_hours_void', () => {
  const voidedAt = (iso: string) => makeExpense({ status: 'void', voidReason: 'x', voidedAt: iso })

  it('flags a void outside 06:00–23:00 Manila', () => {
    expect(flagsOf(voidedAt('2026-10-21T15:00:00Z'))).toEqual(['after_hours_void']) // 23:00
    expect(flagsOf(voidedAt('2026-10-20T21:59:00Z'))).toEqual(['after_hours_void']) // 05:59
    expect(flagsOf(voidedAt('2026-10-20T22:00:00Z'))).toEqual([]) // 06:00
    expect(flagsOf(voidedAt('2026-10-21T14:59:00Z'))).toEqual([]) // 22:59
  })

  it('needs a void time', () => {
    expect(flagsOf(makeExpense({ status: 'void', voidReason: 'x', voidedAt: null }))).toEqual([])
  })
})

const ORDER = ['no_receipt', 'possible_duplicate', 'round_other', 'after_hours_void']
function byFlagOrder(a: string, b: string): number {
  return ORDER.indexOf(a) - ORDER.indexOf(b)
}

describe('computeFlagsForAll', () => {
  it('flags a whole list the same as one by one, keyed by id', () => {
    const list = [
      makeExpense({ id: 'a', amountCents: 150_000 }),
      makeExpense({ id: 'b', amountCents: 12_000, spentOn: '2026-10-20' }),
      makeExpense({ id: 'c', amountCents: 12_000, spentOn: '2026-10-21' }),
      makeExpense({ id: 'd', supplierId: 's', invoiceNo: '1', categoryId: 'cat-lpg', amountCents: 7 }),
      makeExpense({ id: 'e', supplierId: 's', invoiceNo: '1', categoryId: 'cat-water', amountCents: 9 }),
      makeExpense({ id: 'f', categoryId: 'cat-other', amountCents: 60_000 }),
      makeExpense({ id: 'g', status: 'void', voidReason: 'x', voidedAt: '2026-10-21T17:00:00Z' }),
    ]
    const all = computeFlagsForAll(list, { categories })
    for (const expense of list) {
      expect(all[expense.id]).toEqual(computeFlags(expense, { categories, others: list }))
    }
    expect(all).toEqual({
      a: ['no_receipt'],
      b: ['possible_duplicate'],
      c: ['possible_duplicate'],
      d: ['possible_duplicate'],
      e: ['possible_duplicate'],
      f: ['round_other'],
      g: ['after_hours_void'],
    })
    expect(needsALook(all.a)).toBe(true)
    expect(needsALook([])).toBe(false)
  })
})
