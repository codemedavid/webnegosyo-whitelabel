import { previewMenuRows } from '@/components/onboarding/preview-menu'

describe('previewMenuRows — the live preview reads what the owner typed', () => {
  test('splits "name – price" lines in every common shape', () => {
    // Act
    const rows = previewMenuRows('Chicken Adobo – 150\nPancit Canton: ₱120\nHalo-halo P95.50\nIced Tea', [])

    // Assert
    expect(rows).toEqual([
      { name: 'Chicken Adobo', price: '150', isBestSeller: false },
      { name: 'Pancit Canton', price: '120', isBestSeller: false },
      { name: 'Halo-halo', price: '95.50', isBestSeller: false },
      { name: 'Iced Tea', price: null, isBestSeller: false },
    ])
  })

  test('best sellers lead, borrowing their price from the typed menu', () => {
    // Act
    const rows = previewMenuRows('Chicken Adobo - 150\nSisig - 180', ['sisig', 'Lumpia'])

    // Assert
    expect(rows.map((row) => [row.name, row.price, row.isBestSeller])).toEqual([
      ['sisig', '180', true],
      ['Lumpia', null, true],
      ['Chicken Adobo', '150', false],
    ])
  })

  test('caps the list and skips blank lines', () => {
    // Act
    const rows = previewMenuRows('\n\nA 1\nB 2\nC 3\nD 4\nE 5\nF 6\nG 7', [], 3)

    // Assert
    expect(rows.map((row) => row.name)).toEqual(['A', 'B', 'C'])
  })
})
