/** @jest-environment node */
/**
 * Menu photo → dishes: photos are checked at the door, the parser's dishes are
 * matched to the store's own categories and menu, the owner's corrections
 * replace the card, and the confirmed import adds each dish once.
 */

import { createRefBook } from '@/lib/assistant/refs'
import type { MenuImportPayload } from '@/lib/assistant/actions/kinds'
import type { ParsedMenuData } from '@/types/ai-menu-parser'

jest.mock('server-only', () => ({}))

const mockParse = jest.fn()
jest.mock('@/lib/menu-import/parse-menu-ai', () => ({ parseMenuWithAi: (...a: unknown[]) => mockParse(...a) }))
const mockMenu = { readAssistantCategories: jest.fn(), readAssistantMenu: jest.fn() }
jest.mock('@/lib/assistant/data/menu', () => mockMenu)
const mockActions = { createPendingAction: jest.fn(), loadAction: jest.fn(), cancelOtherPending: jest.fn() }
jest.mock('@/lib/assistant/actions/store', () => mockActions)

const PHOTO = `data:image/jpeg;base64,${'A'.repeat(200)}`

const PARSED: ParsedMenuData = {
  categories: [{ name: 'rice meals', icon: '🍚' }, { name: 'Drinks', icon: '🥤' }],
  items: [
    { name: 'Chicken Adobo', category: 'rice meals', price: 180, description: 'Braised in soy and vinegar.' },
    { name: 'Sinigang', category: 'rice meals', price: 220 },
    { name: 'Iced Tea', category: 'Drinks', price: 0, variations: [{ name: 'Size', isRequired: true, options: [{ name: 'Regular', priceModifier: 0 }, { name: 'Large', priceModifier: 20 }] }] },
    { name: 'chicken adobo', category: 'rice meals', price: 180 },
    { name: 'Lumpia', category: 'Starters', price: 90 },
  ],
}

const STORE = { categories: [{ name: 'Rice Meals' }], itemNames: ['Lumpia'] }

function ctx(photos: string[] = [PHOTO], refs = createRefBook({})) {
  return {
    tenantId: 't',
    tenantSlug: 's',
    conversationId: 'c',
    caller: { userId: 'u', role: 'admin', is_owner: true, permissions: null },
    flags: { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true },
    refs,
    photos,
    memo: <T,>(_key: string, load: () => Promise<T>) => load(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockMenu.readAssistantCategories.mockResolvedValue([{ id: 'k1', name: 'Rice Meals' }])
  mockMenu.readAssistantMenu.mockResolvedValue([{ id: 'i1', name: 'Lumpia', price: 90 }])
  mockActions.createPendingAction.mockResolvedValue({ id: 'act-1', expiresAt: '2026-10-07T01:00:00Z' })
  mockActions.cancelOtherPending.mockResolvedValue(undefined)
  mockParse.mockResolvedValue({ ok: true, data: PARSED })
})

describe('checkMessagePhotos', () => {
  test('no photos is fine; images pass; anything else is refused with a reason', async () => {
    const { checkMessagePhotos } = await import('@/lib/assistant/photos')

    expect(checkMessagePhotos(undefined)).toEqual({ ok: true, photos: [] })
    expect(checkMessagePhotos([PHOTO])).toEqual({ ok: true, photos: [PHOTO] })
    expect(checkMessagePhotos([PHOTO, PHOTO, PHOTO, PHOTO])).toMatchObject({ ok: false })
    expect(checkMessagePhotos(['data:image/gif;base64,AAAA'])).toMatchObject({ ok: false, error: 'Photos must be JPEG, PNG or WebP.' })
    expect(checkMessagePhotos([`data:image/jpeg;base64,${'A'.repeat(3_000_001)}`])).toMatchObject({ ok: false })
    expect(checkMessagePhotos('nope')).toMatchObject({ ok: false })
  })
})

describe('buildImportDraft', () => {
  test('matches the store’s categories, skips dishes already on the menu or repeated, keeps the parser’s icon for new ones', async () => {
    const { buildImportDraft } = await import('@/lib/assistant/insights/menu-import')

    const draft = buildImportDraft(PARSED, STORE)

    expect(draft.payload.items.map((i) => [i.name, i.category])).toEqual([
      ['Chicken Adobo', 'Rice Meals'],
      ['Sinigang', 'Rice Meals'],
      ['Iced Tea', 'Drinks'],
    ])
    expect(draft.payload.categories).toEqual([
      { name: 'Rice Meals', icon: null, isNew: false },
      { name: 'Drinks', icon: '🥤', isNew: true },
    ])
    expect(draft.alreadyOnMenu).toEqual(['Lumpia'])
    expect(draft.payload.items[2].variations).toHaveLength(1)
  })

  test('names printed in capitals are tidied; mixed case is left alone', async () => {
    const { tidyName } = await import('@/lib/assistant/insights/menu-import')

    expect(tidyName('CHICKEN ADOBO (2 PCS)')).toBe('Chicken Adobo (2 Pcs)')
    expect(tidyName('DRINKS')).toBe('Drinks')
    expect(tidyName('BBQ Wings')).toBe('BBQ Wings')
    expect(tidyName('  halo-halo  ')).toBe('halo-halo')
  })

  test('an import is capped, and the rest is counted rather than silently lost', async () => {
    const { buildImportDraft } = await import('@/lib/assistant/insights/menu-import')

    const draft = buildImportDraft(PARSED, { categories: [], itemNames: [] }, 2)

    expect(draft.payload.items).toHaveLength(2)
    expect(draft.overLimit).toBe(2)
  })
})

describe('applyImportEdits', () => {
  const payload: MenuImportPayload = {
    categories: [{ name: 'Rice Meals', icon: null, isNew: false }, { name: 'Drinks', icon: '🥤', isNew: true }],
    items: [
      { name: 'Chicken Adobo', category: 'Rice Meals', price: 180 },
      { name: 'Iced Tea', category: 'Drinks', price: 0 },
    ],
  }

  test('removes, re-prices and re-files dishes; a category nobody uses any more disappears', async () => {
    const { applyImportEdits } = await import('@/lib/assistant/insights/menu-import')

    const edited = applyImportEdits(payload, { remove: [], changes: [{ index: 1, name: null, price: 45, category: 'rice meals' }] }, STORE)

    expect(edited).toEqual({
      categories: [{ name: 'Rice Meals', icon: null, isNew: false }],
      items: [
        { name: 'Chicken Adobo', category: 'Rice Meals', price: 180 },
        { name: 'Iced Tea', category: 'Rice Meals', price: 45 },
      ],
    })
  })

  test('refuses an edit that empties the import, renames onto an existing dish, or points outside it', async () => {
    const { applyImportEdits } = await import('@/lib/assistant/insights/menu-import')

    expect(applyImportEdits(payload, { remove: [0, 1], changes: [] }, STORE)).toBe('That would leave nothing to add.')
    expect(applyImportEdits(payload, { remove: [], changes: [{ index: 0, name: 'Lumpia', price: null, category: null }] }, STORE)).toMatch(/already on the menu/)
    expect(applyImportEdits(payload, { remove: [5], changes: [] }, STORE)).toMatch(/not in this import/)
  })

  test('the card lists the dishes, flags missing prices and names new categories', async () => {
    const { importCardLines, importWarning } = await import('@/lib/assistant/insights/menu-import')

    expect(importCardLines(payload)).toEqual([
      { label: 'Chicken Adobo', value: '₱180 · Rice Meals' },
      { label: 'Iced Tea', value: 'No price yet · Drinks' },
      { label: 'New categories', value: 'Drinks' },
    ])
    expect(importWarning(payload)).toMatch(/^1 dish has no price yet/)
  })
})

describe('propose_menu_from_photo', () => {
  test('without a photo on this message it asks for one and reads nothing', async () => {
    const { proposeMenuFromPhotoTool } = await import('@/lib/assistant/tools/propose/menu-photo')

    const result = await proposeMenuFromPhotoTool.run(ctx([]), { note: null })

    expect(result.facts).toMatchObject({ proposed: false })
    expect(mockParse).not.toHaveBeenCalled()
  })

  test('reads the photos with the owner’s note and files ONE import the model addresses by refs', async () => {
    const { proposeMenuFromPhotoTool } = await import('@/lib/assistant/tools/propose/menu-photo')

    const result = await proposeMenuFromPhotoTool.run(ctx(), { note: 'only the food' })

    expect(mockParse).toHaveBeenCalledWith({ text: 'only the food', images: [PHOTO] }, expect.objectContaining({ fetchImpl: expect.any(Function) }))
    const filed = mockActions.createPendingAction.mock.calls[0][0]
    expect(filed).toMatchObject({ kind: 'menu_import', summary: 'Add 3 dishes from a menu photo' })
    expect((filed.payload as MenuImportPayload).items).toHaveLength(3)
    expect(result.facts).toMatchObject({
      proposed: true,
      import: 'n1',
      dishes: ['d1 Chicken Adobo ₱180 [Rice Meals]', 'd2 Sinigang ₱220 [Rice Meals]', 'd3 Iced Tea (no price) [Drinks]'],
      alreadyOnMenuSkipped: ['Lumpia'],
      newCategories: ['Drinks'],
    })
    expect(result.card).toMatchObject({ type: 'confirm', title: 'Add 3 dishes to your menu' })
    // A second photo in the same chat must not leave two overlapping cards confirmable.
    expect(mockActions.cancelOtherPending).toHaveBeenCalledWith(expect.objectContaining({ kind: 'menu_import', keepId: 'act-1' }))
    expect(JSON.stringify(result.facts)).not.toContain(PHOTO)
  })

  test('a parser outage is told plainly; nothing is filed', async () => {
    mockParse.mockResolvedValue({ ok: false, error: 'OpenRouter exploded', status: 500 })
    const { proposeMenuFromPhotoTool } = await import('@/lib/assistant/tools/propose/menu-photo')

    const result = await proposeMenuFromPhotoTool.run(ctx(), { note: null })

    expect(result.facts).toEqual({ proposed: false, reason: 'The photo could not be read right now. Ask the owner to try again in a moment.' })
    expect(mockActions.createPendingAction).not.toHaveBeenCalled()
  })
})

describe('propose_menu_import_edit', () => {
  const stored: MenuImportPayload = {
    categories: [{ name: 'Rice Meals', icon: null, isNew: false }],
    items: [
      { name: 'Chicken Adobo', category: 'Rice Meals', price: 180 },
      { name: 'Sinigang', category: 'Rice Meals', price: 220 },
    ],
  }
  const action = { id: 'act-1', tenantId: 't', conversationId: 'c', createdBy: 'u', kind: 'menu_import', payload: stored, summary: '', status: 'pending', expiresAt: '' }

  function refsFor(actionId: string) {
    const refs = createRefBook({})
    refs.refFor('import', actionId)
    refs.refFor('draft', `${actionId}#0`)
    refs.refFor('draft', `${actionId}#1`)
    return refs
  }

  test('files the corrected import and cancels every other import card in the chat', async () => {
    mockActions.loadAction.mockResolvedValue(action)
    mockActions.createPendingAction.mockResolvedValue({ id: 'act-2', expiresAt: '2026-10-07T01:00:00Z' })
    const { proposeMenuImportEditTool } = await import('@/lib/assistant/tools/propose/menu-photo')

    const result = await proposeMenuImportEditTool.run(ctx([], refsFor('act-1')), { import: 'n1', remove: ['d2'], changes: [{ dish: 'd1', name: null, price: 175, category: null }] })

    expect((mockActions.createPendingAction.mock.calls[0][0].payload as MenuImportPayload).items).toEqual([{ name: 'Chicken Adobo', category: 'Rice Meals', price: 175 }])
    expect(mockActions.cancelOtherPending).toHaveBeenCalledWith({ tenantId: 't', conversationId: 'c', userId: 'u', kind: 'menu_import', keepId: 'act-2' })
    expect(result.facts).toMatchObject({ proposed: true, import: 'n2', dishes: ['d3 Chicken Adobo ₱175 [Rice Meals]'] })
  })

  test('a dish ref from another import, or an import already added, changes nothing', async () => {
    const refs = refsFor('act-1')
    refs.refFor('draft', 'act-9#0')
    mockActions.loadAction.mockResolvedValue(action)
    const { proposeMenuImportEditTool } = await import('@/lib/assistant/tools/propose/menu-photo')

    const foreign = await proposeMenuImportEditTool.run(ctx([], refs), { import: 'n1', remove: ['d3'], changes: null })
    mockActions.loadAction.mockResolvedValue({ ...action, status: 'applied' })
    const applied = await proposeMenuImportEditTool.run(ctx([], refs), { import: 'n1', remove: ['d1'], changes: null })

    expect(foreign.facts).toMatchObject({ proposed: false, reason: 'One of those dish refs is not part of this import.' })
    expect(applied.facts).toMatchObject({ proposed: false })
    expect(mockActions.createPendingAction).not.toHaveBeenCalled()
    expect(mockActions.cancelOtherPending).not.toHaveBeenCalled()
  })

  test('another person’s import cannot be edited', async () => {
    mockActions.loadAction.mockResolvedValue({ ...action, createdBy: 'someone-else' })
    const { proposeMenuImportEditTool } = await import('@/lib/assistant/tools/propose/menu-photo')

    const result = await proposeMenuImportEditTool.run(ctx([], refsFor('act-1')), { import: 'n1', remove: ['d1'], changes: null })

    expect(result.facts).toMatchObject({ proposed: false })
  })
})

test('the context note tells the model a photo came with the message', async () => {
  const { buildContextNote } = await import('@/lib/assistant/prompt')

  expect(buildContextNote({ storeName: 'S', now: new Date(0), toolNames: ['x'], photoCount: 2 })).toContain('Attached to this message: 2 photos')
  expect(buildContextNote({ storeName: 'S', now: new Date(0), toolNames: ['x'] })).not.toContain('Attached')
})
