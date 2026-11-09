/** @jest-environment node */
import {
  addressAfterPick,
  cleanAddressQuery,
  isDoorShapedLabel,
  mergeSuggestions,
  nearLabel,
  searchQueriesFor,
  withoutHouseNumber,
} from '@/lib/maps/address-query'

describe('cleanAddressQuery', () => {
  it.each([
    ['Blk 4 Lot 12 Phase 2 Camella Homes Tanza Cavite', 'Camella Homes Tanza Cavite'],
    ['Block 12 Lot 8 Deca Homes Marilao Bulacan', 'Deca Homes Marilao Bulacan'],
    ['Lot 5 Blk 3 Lancaster New City General Trias Cavite', 'Lancaster New City General Trias Cavite'],
    ['123 Zamora St Brgy Samput Paniqui Tarlac', 'Zamora St Brgy Samput Paniqui Tarlac'],
    ['Purok 3 Brgy Mintal Davao City', 'Brgy Mintal Davao City'],
    ['Sitio Kamunggay Brgy Lahug Cebu City', 'Brgy Lahug Cebu City'],
    ['Zone 2 Barangay Cabetican Bacolor Pampanga', 'Barangay Cabetican Bacolor Pampanga'],
    ['45 Rose St Mintal Davao City near chapel', 'Rose St Mintal Davao City'],
    ['Unit 5B Tower 2 Vista Verde Cainta Rizal', 'Vista Verde Cainta Rizal'],
    ['#18 Edison St Lahug Cebu tapat ng sari sari store', 'Edison St Lahug Cebu'],
    ['beside Salawag National High School Dasmarinas', 'Salawag National High School Dasmarinas'],
    ['likod ng Paniqui Public Market', 'Paniqui Public Market'],
    ['near Jollibee Tanza Cavite', 'Jollibee Tanza Cavite'],
  ])('reads %p as %p', (typed, cleaned) => {
    expect(cleanAddressQuery(typed)).toBe(cleaned)
  })

  it('leaves a plain place name alone', () => {
    expect(cleanAddressQuery('SM North EDSA')).toBe('SM North EDSA')
    expect(cleanAddressQuery('Barangay 143 Caloocan')).toBe('Barangay 143 Caloocan')
    expect(cleanAddressQuery('Trade Building, Makati')).toBe('Trade Building, Makati')
    expect(cleanAddressQuery('Tower Records Makati')).toBe('Tower Records Makati')
  })

  it('finds a house number after a comma', () => {
    expect(cleanAddressQuery('Camella Homes, 18 Rizal St')).toBe('Camella Homes, Rizal St')
  })

  it('parses on browsers without regex lookbehind', () => {
    const source = require('fs').readFileSync('src/lib/maps/address-query.ts', 'utf8') as string
    expect(source).not.toMatch(/\(\?<[=!]/)
  })
})

describe('searchQueriesFor', () => {
  it('searches the cleaned words first, then the words as typed', () => {
    expect(searchQueriesFor('Blk 4 Lot 12 Camella Tanza')).toEqual(['Camella Tanza', 'Blk 4 Lot 12 Camella Tanza'])
  })

  it('searches once when there is nothing to clean', () => {
    expect(searchQueriesFor('Camella Tanza')).toEqual(['Camella Tanza'])
  })

  it('keeps the words as typed when cleaning leaves nothing searchable', () => {
    expect(searchQueriesFor('Blk 4 Lot 12')).toEqual(['Blk 4 Lot 12'])
    expect(searchQueriesFor('   ')).toEqual([])
  })
})

describe('isDoorShapedLabel', () => {
  it.each([
    'Blk 4 Lot 20 Camella Homes Bayan Luma 3, Stigma Street',
    'Block 40 lot 80 Deca Homes Meycauayan',
    'Camella Tanza Block 09 Lot 07, Bagtas',
    'Lot 5, Rizal Street',
    '#12 Mabini',
  ])('flags %p', (label) => {
    expect(isDoorShapedLabel(label)).toBe(true)
  })

  it.each(['Camella Homes Tanza, Tanza, Cavite', 'Paniqui Public Market', '123 Zamora Street, Samput', 'Tower Records'])('passes %p', (label) => {
    expect(isDoorShapedLabel(label)).toBe(false)
  })
})

describe('mergeSuggestions', () => {
  it('drops repeats and puts door-shaped entries last', () => {
    const merged = mergeSuggestions([
      [{ label: 'Blk 4 Lot 20 Camella Homes' }, { label: 'Camella Homes Tanza' }],
      [{ label: 'camella homes  tanza' }, { label: 'Tanza, Cavite' }],
    ])
    expect(merged.map((entry) => entry.label)).toEqual(['Camella Homes Tanza', 'Tanza, Cavite', 'Blk 4 Lot 20 Camella Homes'])
  })

  it('never returns more than eight', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ label: `Place ${index}` }))
    expect(mergeSuggestions([many])).toHaveLength(8)
  })
})

describe('addressAfterPick', () => {
  it('uses the picked place when the customer typed no door', () => {
    expect(addressAfterPick('Camella Tanza', 'Camella Homes Tanza, Tanza, Cavite')).toBe('Camella Homes Tanza, Tanza, Cavite')
  })

  it("keeps the customer's own door on the picked place", () => {
    expect(addressAfterPick('Blk 4 Lot 12 Camella', 'Camella Homes Tanza, Tanza, Cavite')).toBe('Blk 4 Lot 12, Camella Homes Tanza, Tanza, Cavite')
  })

  it("never lends the customer someone else's lot number", () => {
    expect(addressAfterPick('Blk 4 Lot 12 Camella', 'Blk 4 Lot 20 Camella Homes Bayan Luma 3, Stigma Street')).toBe(
      'Blk 4 Lot 12, Camella Homes Bayan Luma 3, Stigma Street',
    )
    expect(addressAfterPick('Camella', 'Blk 4 Lot 20 Camella Homes Bayan Luma 3')).toBe('Camella Homes Bayan Luma 3')
  })

  it('keeps directions in the customer\'s words', () => {
    expect(addressAfterPick('likod ng Paniqui Public Market', 'Paniqui Public Market, Paniqui, Tarlac')).toBe('likod ng Paniqui Public Market, Paniqui, Tarlac')
    expect(addressAfterPick('45 Rose St near chapel', 'Rose Street, Davao City')).toBe('45, Rose Street, Davao City, near chapel')
  })
})

describe('withoutHouseNumber and nearLabel', () => {
  it('drops the house number a map guessed', () => {
    expect(withoutHouseNumber('9 A. Roxas Street, Tabing Ilog, Marilao')).toBe('A. Roxas Street, Tabing Ilog, Marilao')
    expect(withoutHouseNumber('860–869 Narra Street, Real')).toBe('Narra Street, Real')
    expect(withoutHouseNumber('Zamora Street, Samput')).toBe('Zamora Street, Samput')
  })

  it('shortens to what the customer recognises', () => {
    expect(nearLabel('9 A. Roxas Street, Tabing Ilog, Marilao, 3019 Bulacan, Philippines')).toBe('A. Roxas Street, Tabing Ilog, Marilao, Bulacan')
  })
})
