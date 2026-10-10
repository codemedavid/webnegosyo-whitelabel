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
  it('rewards a best seller worth earning with a free item after 8 stamps', async () => {
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
      // Half a typical main (₱180), rounded down to ₱10: a lone add-on earns nothing.
      minSpend: 90,
      rewardExpiryDays: 30,
      reward: { type: 'free_item', menuItemId: 'latte', itemName: 'Iced Latte' },
    })
    expect(STARTER_STAMP_THRESHOLD).toBe(8)
  })

  it('picks an item worth eight visits, not the cheapest thing on the menu', async () => {
    const { buildStarterLoyaltyProgram } = await load()

    const result = buildStarterLoyaltyProgram({ storeName: 'Store', items: ITEMS, bestSellerIds: ['halo', 'missing'] })

    // Water is free, Halo-Halo is unavailable and ₱25 rice is not worth 8 visits.
    expect(result!.rewardItemId).toBe('latte')
  })

  it('on a silog menu, gives a free silog and skips free sides and ₱25 water', async () => {
    const { buildStarterLoyaltyProgram, parseLoyaltyProgramInput } = await load()
    const silogs = [109, 129, 139, 139, 145, 154, 159, 169, 179, 184].map((price, index) => ({
      id: `silog-${price}-${index}`,
      name: ['Tuyosilog', 'Hakdogsilog', 'Daksilog', 'Spamsilog', 'Longsilog', 'Tocilog', 'Porkchopsilog', 'Liemposilog', 'Sisigsilog', 'Bangsilog'][index],
      price,
      isAvailable: true,
    }))
    const items = [
      ...silogs,
      { id: 'water', name: 'Wilkins Mineral', price: 25, isAvailable: true },
      { id: 'coke', name: 'Regular Coke', price: 38, isAvailable: true },
      { id: 'rice', name: 'Garlic Rice', price: 0, isAvailable: true },
    ]

    const result = buildStarterLoyaltyProgram({ storeName: "Juan's Kitchen", items, bestSellerIds: [] })

    // "Tocilog" has no -silog ending, so the median of the nine silogs is ₱145
    // and the reward lands near ₱116 (about a tenth of 8 orders).
    expect(result!.rewardLabel).toBe('Free Tuyosilog')
    const parsed = parseLoyaltyProgramInput(result!.program)
    expect(parsed.ok && parsed.value.rules.minSpend).toBe(70)
  })

  it("sizes the reward and the minimum spend from the owner's typical order when we have it", async () => {
    const { buildStarterLoyaltyProgram, parseLoyaltyProgramInput } = await load()

    const result = buildStarterLoyaltyProgram({ storeName: 'Store', items: ITEMS, bestSellerIds: [], typicalOrder: 250 })

    // Target ₱200: the ₱180 adobo is the closest worthwhile item.
    expect(result!.rewardItemId).toBe('adobo')
    const parsed = parseLoyaltyProgramInput(result!.program)
    expect(parsed.ok && parsed.value.rules.minSpend).toBe(120)
  })

  it('leaves the minimum spend off when the menu is too cheap for one to matter', async () => {
    const { buildStarterLoyaltyProgram, parseLoyaltyProgramInput } = await load()

    const result = buildStarterLoyaltyProgram({
      storeName: 'Store',
      items: [{ id: 'a', name: 'Fishball', price: 15, isAvailable: true }, { id: 'b', name: 'Kikiam', price: 20, isAvailable: true }],
      bestSellerIds: [],
    })

    const parsed = parseLoyaltyProgramInput(result!.program)
    expect(parsed.ok && parsed.value.rules.minSpend).toBeNull()
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
