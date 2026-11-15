import { findDishes, foldWords, readsLikeOrder, type DishName } from '@/lib/messenger/typed-order'

const MENU: DishName[] = [
  { id: 'inasal', name: 'Chicken Inasal' },
  { id: 'inasal-paa', name: 'Chicken Inasal Paa' },
  { id: 'halo', name: 'Halo-Halo' },
  { id: 'sisig', name: 'Sisig' },
  { id: 'coke', name: 'Coke' },
  { id: 'rice', name: 'Rice' },
  { id: 'milktea', name: 'Wintermelon Milktea Meal' },
  { id: 'tiny', name: 'Ok' },
]

const names = (text: string) => findDishes(text, MENU).map((dish) => `${dish.qty}×${dish.id}`)

describe('foldWords', () => {
  it('folds case, accents, punctuation and splits 2x / x2', () => {
    expect(foldWords('Halo-Halo!! Café 2x Sisig, sisig x3')).toBe('halo halo cafe 2 x sisig sisig x 3')
  })
})

describe('findDishes', () => {
  it('reads quantities before and after a dish, in English and Taglish', () => {
    expect(names('2 chicken inasal po')).toEqual(['2×inasal'])
    expect(names('dalawang halo halo')).toEqual(['2×halo'])
    expect(names('apat na sisig')).toEqual(['4×sisig'])
    expect(names('sisig x3 tapos coke 2')).toEqual(['3×sisig', '2×coke'])
    expect(names('isang 2pcs')).toEqual([])
  })

  it('prefers the longer dish name on the same words', () => {
    expect(names('1 chicken inasal paa and 1 rice')).toEqual(['1×inasal-paa', '1×rice'])
  })

  it('finds a dish by its words without the generic ones', () => {
    expect(names('wintermelon milktea please')).toEqual(['1×milktea'])
  })

  it('ignores dish names too short to tell apart, and words inside other words', () => {
    expect(names('ok po salamat')).toEqual([])
    expect(names('ricecake')).toEqual([])
  })

  it('names a dish once even when it is said twice', () => {
    expect(names('sisig po, sisig ulit')).toEqual(['1×sisig'])
  })
})

describe('readsLikeOrder', () => {
  const isOrder = (text: string) => readsLikeOrder(text, MENU).isOrder

  it('counts a dish with an order word or a quantity as an order', () => {
    expect(isOrder('pa order po ng sisig')).toBe(true)
    expect(isOrder('2 chicken inasal, 1 coke')).toBe(true)
    expect(isOrder('pabili po halo halo')).toBe(true)
    expect(isOrder('I want sisig for pickup')).toBe(true)
  })

  it('does not count a question about a dish', () => {
    expect(isOrder('magkano po ang sisig?')).toBe(false)
    expect(isOrder('may halo halo pa kayo?')).toBe(false)
  })

  it('needs more than an order word alone (the keyword automations answer those)', () => {
    expect(isOrder('order')).toBe(false)
    expect(isOrder('pa order po')).toBe(false)
    expect(isOrder('hello')).toBe(false)
  })

  it('counts an order of dishes the menu names differently when it has an order word and a number', () => {
    expect(isOrder('pa order po 3 lechon kawali')).toBe(true)
  })

  it('leaves questions about an order already placed to "Where is my order"', () => {
    expect(isOrder('where is my order 7')).toBe(false)
    expect(isOrder('asan na po order ko? 2 sisig yun')).toBe(false)
    expect(isOrder('status ng order 12')).toBe(false)
    expect(isOrder('2 sisig po for pickup')).toBe(true)
  })

  it('never mistakes a phone number for a quantity', () => {
    expect(isOrder('sisig 09171234567')).toBe(false)
  })
})
