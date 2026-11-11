import {
  GROUP_LABELS,
  PICKER_TOP_COUNT,
  SEED_CATEGORIES,
  affectsProfit,
  isOperatingGroup,
  rankCategoriesForPicker,
  sortCategories,
} from '@/lib/expenses/categories'
import { EXPENSE_GROUPS } from '@/lib/expenses/types'
import { makeCategory, makeExpense, seededCategories } from './engine-fixtures'

/** Contract §4, verbatim: system_key | name | grp | icon | needs_note. */
const CONTRACT_SEED = `
ingredients        | Ingredients (Palengke)              | ingredients | IN | f
ice                | Ice (Yelo)                          | ingredients | IC | f
drinks             | Drinks & bar stock                  | ingredients | DR | f
packaging          | Packaging (Lalagyan)                | ingredients | PK | f
wages              | Salaries & wages (Sahod)            | staff       | SW | f
gov_contributions  | SSS / PhilHealth / Pag-IBIG         | staff       | GC | f
staff_meals        | Staff meals & allowances            | staff       | SM | f
thirteenth_month   | 13th month                          | staff       | 13 | f
rent               | Rent (Upa)                          | occupancy   | RE | f
electricity        | Electricity (Kuryente)              | utilities   | EL | f
water              | Water (Tubig)                       | utilities   | WA | f
lpg                | Gas / LPG                           | utilities   | LP | f
internet           | Internet & load                     | utilities   | NT | f
delivery_fees      | Delivery & rider fees               | operating   | DF | f
platform_fees      | Platform & payment fees             | operating   | PF | f
transport          | Transport (Pamasahe)                | operating   | TR | f
cleaning           | Cleaning & supplies                 | operating   | CL | f
repairs            | Repairs (Pagawa)                    | operating   | RP | f
marketing          | Marketing & ads                     | operating   | MK | f
permits            | Permits & taxes                     | admin       | PT | f
accounting         | Accountant & software               | admin       | AC | f
bank_charges       | Bank charges                        | admin       | BC | f
other              | Other                               | other       | OT | t
equipment          | Big purchase (equipment)            | capex       | EQ | f
owner_draw         | Owner took cash (Kinuha ng may-ari) | not_expense | OW | f
bank_deposit       | Bank deposit                        | not_expense | BD | f
loan_payment       | Loan payment                        | not_expense | LN | f
`

describe('SEED_CATEGORIES', () => {
  it('matches the contract seed list row for row, sort order = index × 10', () => {
    const expected = CONTRACT_SEED.trim()
      .split('\n')
      .map((line, index) => {
        const [systemKey, name, group, icon, needsNote] = line.split('|').map((cell) => cell.trim())
        return { systemKey, name, group, icon, needsNote: needsNote === 't', sortOrder: index * 10 }
      })
    expect(SEED_CATEGORIES).toEqual(expected)
  })

  it('has unique keys and names, and icons that fit the 8-char column', () => {
    expect(new Set(SEED_CATEGORIES.map((c) => c.systemKey)).size).toBe(SEED_CATEGORIES.length)
    expect(new Set(SEED_CATEGORIES.map((c) => c.name.toLowerCase())).size).toBe(SEED_CATEGORIES.length)
    expect(SEED_CATEGORIES.every((c) => c.icon.length <= 8 && c.name.length <= 60)).toBe(true)
  })

  it('cannot be mutated', () => {
    expect(Object.isFrozen(SEED_CATEGORIES)).toBe(true)
    expect(Object.isFrozen(SEED_CATEGORIES[0])).toBe(true)
  })
})

describe('GROUP_LABELS', () => {
  it('labels every group in owner words, no accounting jargon', () => {
    expect(GROUP_LABELS).toEqual({
      ingredients: 'Ingredients',
      staff: 'Staff',
      occupancy: 'Rent',
      utilities: 'Utilities',
      operating: 'Running the store',
      admin: 'Admin',
      other: 'Other',
      capex: 'Big purchases',
      not_expense: 'Not an expense',
    })
    for (const label of Object.values(GROUP_LABELS)) {
      expect(label).not.toMatch(/COGS|capex|opex|occupancy|labor/i)
    }
  })
})

describe('group helpers', () => {
  it('operating groups are everything except capex and not_expense', () => {
    const operating = EXPENSE_GROUPS.filter(isOperatingGroup)
    expect(operating).toEqual(['ingredients', 'staff', 'occupancy', 'utilities', 'operating', 'admin', 'other'])
  })

  it('only not_expense never affects profit', () => {
    expect(EXPENSE_GROUPS.filter((group) => !affectsProfit(group))).toEqual(['not_expense'])
  })
})

describe('sortCategories', () => {
  it('orders by sortOrder then name, without touching the input', () => {
    const input = [
      makeCategory({ name: 'Zeta', sortOrder: 10 }),
      makeCategory({ name: 'beta', sortOrder: 10 }),
      makeCategory({ name: 'Alpha', sortOrder: 20 }),
      makeCategory({ name: 'First', sortOrder: 0 }),
    ]
    const snapshot = input.map((c) => c.name)
    expect(sortCategories(input).map((c) => c.name)).toEqual(['First', 'beta', 'Zeta', 'Alpha'])
    expect(input.map((c) => c.name)).toEqual(snapshot)
  })
})

describe('rankCategoriesForPicker', () => {
  // 2026-10-21 10:00 Manila
  const now = new Date('2026-10-21T02:00:00.000Z')

  it('with no history, returns active categories in sortOrder', () => {
    const categories = seededCategories()
    const ranked = rankCategoriesForPicker(categories, [], now)
    expect(ranked.map((c) => c.systemKey)).toEqual(SEED_CATEGORIES.map((c) => c.systemKey))
  })

  it('puts the most used categories of the last 60 days first, then the rest by sortOrder', () => {
    const categories = seededCategories()
    const recent = [
      makeExpense({ categoryId: 'cat-lpg', spentOn: '2026-10-20' }),
      makeExpense({ categoryId: 'cat-lpg', spentOn: '2026-10-01' }),
      makeExpense({ categoryId: 'cat-lpg', spentOn: '2026-09-15' }),
      makeExpense({ categoryId: 'cat-transport', spentOn: '2026-10-19' }),
      makeExpense({ categoryId: 'cat-transport', spentOn: '2026-10-18' }),
      makeExpense({ categoryId: 'cat-rent', spentOn: '2026-10-05' }),
    ]
    const ranked = rankCategoriesForPicker(categories, recent, now).map((c) => c.systemKey)
    expect(ranked.slice(0, 3)).toEqual(['lpg', 'transport', 'rent'])
    expect(ranked.slice(3, 6)).toEqual(['ingredients', 'ice', 'drinks'])
    expect(ranked).toHaveLength(categories.length)
  })

  it('ignores void rows, rows older than 60 days and future rows', () => {
    const categories = seededCategories()
    const recent = [
      makeExpense({ categoryId: 'cat-rent', spentOn: '2026-08-21' }), // 61 days ago
      makeExpense({ categoryId: 'cat-rent', spentOn: '2026-08-22' }), // 60 days ago: counts
      makeExpense({ categoryId: 'cat-water', status: 'void', voidedAt: '2026-10-20T00:00:00Z', voidReason: 'x' }),
      makeExpense({ categoryId: 'cat-water', status: 'void', voidedAt: '2026-10-20T00:00:00Z', voidReason: 'x' }),
      makeExpense({ categoryId: 'cat-marketing', spentOn: '2026-10-23' }),
    ]
    const ranked = rankCategoriesForPicker(categories, recent, now).map((c) => c.systemKey)
    expect(ranked[0]).toBe('rent')
    expect(ranked[1]).toBe('ingredients')
  })

  it('nudges by time of day only between equally used categories', () => {
    const categories = seededCategories()
    // Ice bought in the morning, LPG in the evening; same count each.
    const recent = [
      makeExpense({ categoryId: 'cat-lpg', createdAt: '2026-10-20T11:00:00.000Z' }), // 19:00 Manila
      makeExpense({ categoryId: 'cat-lpg', createdAt: '2026-10-19T11:00:00.000Z' }),
      makeExpense({ categoryId: 'cat-ice', createdAt: '2026-10-20T01:30:00.000Z' }), // 09:30 Manila
      makeExpense({ categoryId: 'cat-ice', createdAt: '2026-10-19T02:30:00.000Z' }), // 10:30 Manila
      makeExpense({ categoryId: 'cat-rent', createdAt: '2026-10-19T02:30:00.000Z' }),
    ]
    const morning = rankCategoriesForPicker(categories, recent, now).map((c) => c.systemKey)
    expect(morning.slice(0, 3)).toEqual(['ice', 'lpg', 'rent'])

    const evening = rankCategoriesForPicker(categories, recent, new Date('2026-10-21T11:30:00.000Z'))
    expect(evening.slice(0, 3).map((c) => c.systemKey)).toEqual(['lpg', 'ice', 'rent'])

    // A category used once more always wins over a time-of-day match.
    const more = [...recent, makeExpense({ categoryId: 'cat-lpg', createdAt: '2026-10-18T11:00:00.000Z' })]
    expect(rankCategoriesForPicker(categories, more, now)[0].systemKey).toBe('lpg')
  })

  it('wraps the time-of-day window across midnight', () => {
    const categories = seededCategories()
    const recent = [
      makeExpense({ categoryId: 'cat-cleaning', createdAt: '2026-10-19T15:30:00.000Z' }), // 23:30 Manila
      makeExpense({ categoryId: 'cat-ice', createdAt: '2026-10-19T04:00:00.000Z' }), // 12:00 Manila
    ]
    const atMidnight = new Date('2026-10-20T16:30:00.000Z') // 00:30 Manila
    expect(rankCategoriesForPicker(categories, recent, atMidnight)[0].systemKey).toBe('cleaning')
  })

  it('excludes archived categories and ignores expenses in unknown categories', () => {
    const categories = seededCategories().map((c) =>
      c.systemKey === 'lpg' ? { ...c, archivedAt: '2026-10-01T00:00:00Z' } : c,
    )
    const recent = [makeExpense({ categoryId: 'cat-lpg' }), makeExpense({ categoryId: 'cat-gone' })]
    const ranked = rankCategoriesForPicker(categories, recent, now)
    expect(ranked.find((c) => c.systemKey === 'lpg')).toBeUndefined()
    expect(ranked).toHaveLength(categories.length - 1)
    expect(ranked[0].systemKey).toBe('ingredients')
  })

  it('caps the frequency-ranked head at the picker size', () => {
    const categories = seededCategories()
    const used = categories.slice(0, PICKER_TOP_COUNT + 2)
    // Later categories get MORE uses, so frequency order is the reverse of sortOrder.
    const recent = used.flatMap((c, index) =>
      Array.from({ length: index + 1 }, () => makeExpense({ categoryId: c.id })),
    )
    const ranked = rankCategoriesForPicker(categories, recent, now)
    const head = ranked.slice(0, PICKER_TOP_COUNT).map((c) => c.id)
    expect(head).toEqual(
      used
        .slice()
        .reverse()
        .slice(0, PICKER_TOP_COUNT)
        .map((c) => c.id),
    )
    // The two least used fall back into sortOrder with everything else.
    expect(ranked[PICKER_TOP_COUNT].id).toBe(used[0].id)
    expect(rankCategoriesForPicker(categories, recent, now, 3).slice(0, 3).map((c) => c.id)).toEqual(head.slice(0, 3))
  })
})
