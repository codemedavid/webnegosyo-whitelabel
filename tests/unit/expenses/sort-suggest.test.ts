import { foldReason, suggestCategoryForReason } from '@/lib/expenses/sort-suggest'
import { seededCategories } from './engine-fixtures'

const categories = seededCategories()

function keyFor(reason: string): string | null {
  return suggestCategoryForReason(reason, categories)?.systemKey ?? null
}

describe('suggestCategoryForReason', () => {
  it.each([
    ['ice', 'ice'],
    ['Yelo 2 sako', 'ice'],
    ['LPG refill', 'lpg'],
    ['gasul', 'lpg'],
    ['bili gas', 'lpg'],
    ['palengke', 'ingredients'],
    ['baboy at manok', 'ingredients'],
    ['gulay', 'ingredients'],
    ['veggies', 'ingredients'],
    ['Bigas 25kg', 'ingredients'],
    ['rice', 'ingredients'],
    ['meat', 'ingredients'],
    ['Sprite 1.5L', 'drinks'],
    ['coke', 'drinks'],
    ['softdrinks', 'drinks'],
    ['beer', 'drinks'],
    ['mineral water', 'drinks'],
    ['staff meal', 'staff_meals'],
    ['ulam ng crew', 'staff_meals'],
    ['kain', 'staff_meals'],
    ['delivery', 'delivery_fees'],
    ['rider tip', 'delivery_fees'],
    ['Lalamove', 'delivery_fees'],
    ['grab', 'delivery_fees'],
    ['pamasahe', 'transport'],
    ['jeep fare', 'transport'],
    ['tricycle', 'transport'],
    ['grab car pauwi', 'transport'],
    ['gasolina', 'transport'],
    ['load', 'internet'],
    ['wifi', 'internet'],
    ['internet', 'internet'],
    ['kuryente', 'electricity'],
    ['MERALCO bill', 'electricity'],
    ['electric', 'electricity'],
    ['tubig', 'water'],
    ['water bill', 'water'],
    ['Maynilad', 'water'],
    ['rent', 'rent'],
    ['upa sa pwesto', 'rent'],
    ['sahod', 'wages'],
    ['salary', 'wages'],
    ['wage', 'wages'],
    ['cash advance', 'wages'],
    ['vale ni Jun', 'wages'],
    ['SSS', 'gov_contributions'],
    ['pag-ibig', 'gov_contributions'],
    ['13th month', 'thirteenth_month'],
    ['styro cups', 'packaging'],
  ])('%p → %p', (reason, systemKey) => {
    expect(keyFor(reason)).toBe(systemKey)
  })

  it('returns the category id with the key', () => {
    expect(suggestCategoryForReason('Yelo', categories)).toEqual({ categoryId: 'cat-ice', systemKey: 'ice', confidence: 'high' })
  })

  it('is case and diacritic insensitive', () => {
    expect(keyFor('PÁMASAHE')).toBe('transport')
    expect(keyFor('Kuryénte')).toBe('electricity')
  })

  it('matches whole words only', () => {
    expect(keyFor('gasket')).toBeNull()
    expect(keyFor('download')).toBeNull()
    expect(keyFor('price')).toBeNull()
    expect(keyFor('icecream')).toBeNull()
  })

  it('cannot tell a staff first name, or nothing at all', () => {
    expect(suggestCategoryForReason('Ana', categories)).toBeNull()
    expect(suggestCategoryForReason('', categories)).toBeNull()
    expect(suggestCategoryForReason('   ', categories)).toBeNull()
    expect(suggestCategoryForReason('!!!', categories)).toBeNull()
  })

  it('a longer phrase beats the words inside it', () => {
    expect(suggestCategoryForReason('grab car', categories)?.confidence).toBe('high')
    expect(suggestCategoryForReason('mineral water', categories)?.confidence).toBe('high')
  })

  it('is low confidence when the words point two ways, and picks the most mentioned', () => {
    const mixed = suggestCategoryForReason('yelo at lpg', categories)
    expect(mixed?.confidence).toBe('low')
    expect(mixed?.systemKey).toBe('ice')
    expect(keyFor('lpg, yelo, yelo')).toBe('ice')
  })

  it('is low confidence on a weak word alone', () => {
    expect(suggestCategoryForReason('meal', categories)).toMatchObject({ systemKey: 'staff_meals', confidence: 'low' })
    expect(suggestCategoryForReason('kain', categories)?.confidence).toBe('low')
  })

  it('skips a category the store archived or never had', () => {
    const noIce = categories.map((c) => (c.systemKey === 'ice' ? { ...c, archivedAt: '2026-10-01T00:00:00Z' } : c))
    expect(suggestCategoryForReason('yelo', noIce)).toBeNull()
    expect(suggestCategoryForReason('yelo at lpg', noIce)).toMatchObject({ systemKey: 'lpg' })
    expect(suggestCategoryForReason('yelo', [])).toBeNull()
  })
})

describe('foldReason', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(foldReason('  Pag-IBIG, Ñ!  ')).toBe('pag ibig n')
  })
})
