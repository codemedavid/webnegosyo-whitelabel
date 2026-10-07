/** @jest-environment node */

// A module, not a script: without this its `load` helper shares the global
// type-check scope with every other import-less test file.
export {}

const ITEMS = [
  { id: 'adobo', name: 'Chicken Adobo', price: 180, isAvailable: true },
  { id: 'latte', name: 'Iced Latte', price: 120, isAvailable: true },
  { id: 'rice', name: 'Extra Rice', price: 25, isAvailable: true },
  { id: 'water', name: 'Water', price: 0, isAvailable: true },
  { id: 'halo', name: 'Halo-Halo', price: 90, isAvailable: false },
]

async function load() {
  const starter = await import('@/lib/loyalty/starter-program')
  const { parseLoyaltyProgramInput } = await import('@/lib/loyalty/manage')
  return { ...starter, parseLoyaltyProgramInput }
}

describe('buildStarterLoyaltyProgram', () => {
  it('rewards the cheapest available best seller with a free item after 8 stamps', async () => {
    // Arrange
    const { buildStarterLoyaltyProgram, parseLoyaltyProgramInput, STARTER_STAMP_THRESHOLD } = await load()

    // Act
    const result = buildStarterLoyaltyProgram({
      storeName: 'Kape Ni Juan',
      items: ITEMS,
      bestSellerIds: ['adobo', 'latte', 'halo'],
    })

    // Assert
    expect(result).not.toBeNull()
    expect(result!.rewardItemId).toBe('latte')
    expect(result!.rewardLabel).toBe('Free Iced Latte')
    const parsed = parseLoyaltyProgramInput(result!.program)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.name).toBe('Kape Ni Juan Stamp Card')
    expect(parsed.value.earnMode).toBe('stamp')
    expect(parsed.value.scope).toBe('business')
    expect(parsed.value.rules).toMatchObject({
      earnMode: 'stamp',
      threshold: STARTER_STAMP_THRESHOLD,
      minSpend: null,
      rewardExpiryDays: 30,
      reward: { type: 'free_item', menuItemId: 'latte', itemName: 'Iced Latte' },
    })
    expect(STARTER_STAMP_THRESHOLD).toBe(8)
  })

  it('falls back to the cheapest paid available item when no best seller qualifies', async () => {
    const { buildStarterLoyaltyProgram } = await load()

    const result = buildStarterLoyaltyProgram({ storeName: 'Store', items: ITEMS, bestSellerIds: ['halo', 'missing'] })

    // Water is free and Halo-Halo is unavailable, so Extra Rice wins.
    expect(result!.rewardItemId).toBe('rice')
  })

  it('returns null when no item can be a reward', async () => {
    const { buildStarterLoyaltyProgram } = await load()

    const result = buildStarterLoyaltyProgram({
      storeName: 'Store',
      items: [{ id: 'water', name: 'Water', price: 0, isAvailable: true }, { id: 'halo', name: 'Halo', price: 90, isAvailable: false }],
      bestSellerIds: [],
    })

    expect(result).toBeNull()
  })

  it('keeps the program name within the 80-character limit', async () => {
    const { buildStarterLoyaltyProgram, parseLoyaltyProgramInput } = await load()

    const result = buildStarterLoyaltyProgram({ storeName: 'A'.repeat(120), items: ITEMS, bestSellerIds: [] })

    const parsed = parseLoyaltyProgramInput(result!.program)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.name.length).toBeLessThanOrEqual(80)
  })

  it('names the card generically when the store name is blank', async () => {
    const { buildStarterLoyaltyProgram, parseLoyaltyProgramInput } = await load()

    const result = buildStarterLoyaltyProgram({ storeName: '   ', items: ITEMS, bestSellerIds: [] })

    const parsed = parseLoyaltyProgramInput(result!.program)
    expect(parsed.ok && parsed.value.name).toBe('Stamp Card')
  })
})
