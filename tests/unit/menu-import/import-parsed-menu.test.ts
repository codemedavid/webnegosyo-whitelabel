/**
 * @jest-environment node
 */
import { describe, test, expect } from '@jest/globals'
import type { ParsedMenuData } from '@/types/ai-menu-parser'

type Row = Record<string, unknown>
interface Insert { table: string; rows: Row[] }

/**
 * A chainable stand-in for the Supabase client: categories select/insert and
 * menu_items insert(...).select(). `refuse` decides per insert whether the
 * database rejects it (all-or-nothing, like Postgres).
 */
function fakeClient(opts: { existingCategories?: Array<{ id: string; name: string }>; refuse?: (rows: Row[]) => boolean } = {}) {
    const inserts: Insert[] = []
    let nextId = 1
    const from = (table: string) => ({
        select: () => ({
            eq: async () => ({ data: table === 'categories' ? opts.existingCategories ?? [] : [], error: null }),
        }),
        insert: (payload: Row | Row[]) => {
            const rows = Array.isArray(payload) ? payload : [payload]
            const refused = opts.refuse?.(rows) ?? false
            if (!refused) inserts.push({ table, rows })
            const result = refused
                ? { data: null, error: { message: 'refused' } }
                : { data: rows.map((r) => ({ id: `${table}-${nextId++}`, name: r.name, price: r.price })), error: null }
            return {
                select: () => {
                    const promise = Promise.resolve(result)
                    return Object.assign(promise, {
                        single: async () => ({ data: result.data?.[0] ?? null, error: result.error }),
                    })
                },
            }
        },
    })
    return { client: { from } as never, inserts }
}

const MENU: ParsedMenuData = {
    categories: [{ name: 'Burgers' }, { name: 'Drinks', icon: '🥤' }],
    items: [
        {
            name: 'Classic Burger', category: 'Burgers', price: 120,
            variations: [{ name: 'Size', isRequired: true, options: [{ name: 'Solo', priceModifier: 0 }, { name: 'Double', priceModifier: 50 }] }],
            addons: [{ name: 'Cheese', price: 20 }],
        },
        { name: 'Iced Tea', category: 'drinks', price: 45, note: 'Bottomless' },
        { name: 'Ghost', category: 'Missing', price: 10 },
    ],
}

async function load() {
    return import('@/lib/menu-import/import-parsed-menu')
}

describe('importParsedMenu', () => {
    test('creates categories and items, returning the created items with their category', async () => {
        const { importParsedMenu } = await load()
        const { client, inserts } = fakeClient()

        const results = await importParsedMenu(client, 't1', MENU)

        expect(results.categoriesCreated).toBe(2)
        expect(results.itemsCreated).toBe(2)
        expect(results.itemsFailed).toBe(1)
        expect(results.errors).toEqual([expect.stringContaining('Ghost')])
        expect(results.createdItems).toEqual([
            { id: expect.any(String), name: 'Classic Burger', price: 120, categoryName: 'Burgers' },
            { id: expect.any(String), name: 'Iced Tea', price: 45, categoryName: 'drinks' },
        ])
        // Both items went in ONE request.
        const itemInserts = inserts.filter((i) => i.table === 'menu_items')
        expect(itemInserts).toHaveLength(1)
        const [burger, tea] = itemInserts[0].rows
        expect(burger).toMatchObject({ tenant_id: 't1', image_url: '', is_available: true, variations: [] })
        expect((burger.variation_types as Array<{ options: unknown[] }>)[0].options).toHaveLength(2)
        expect(burger.addons).toEqual([expect.objectContaining({ name: 'Cheese', price: 20 })])
        expect(tea.description).toBe('Bottomless')
    })

    test('reuses an existing category by case-insensitive name', async () => {
        const { importParsedMenu } = await load()
        const { client, inserts } = fakeClient({ existingCategories: [{ id: 'cat-old', name: 'BURGERS' }] })

        const results = await importParsedMenu(client, 't1', MENU)

        expect(results.categoriesSkipped).toBe(1)
        expect(results.categoriesCreated).toBe(1)
        const burger = inserts.find((i) => i.table === 'menu_items')!.rows.find((r) => r.name === 'Classic Burger')
        expect(burger?.category_id).toBe('cat-old')
    })

    test('retries a refused batch row by row so one bad item does not sink the rest', async () => {
        const { importParsedMenu } = await load()
        const { client } = fakeClient({
            refuse: (rows) => rows.some((r) => r.name === 'Iced Tea' && 'category_id' in r),
        })

        const results = await importParsedMenu(client, 't1', MENU)

        expect(results.itemsCreated).toBe(1)
        expect(results.itemsFailed).toBe(2)
        expect(results.createdItems.map((i) => i.name)).toEqual(['Classic Burger'])
        expect(results.errors).toEqual(expect.arrayContaining([expect.stringContaining('Iced Tea')]))
    })

    test('gives every item its own option and add-on ids', async () => {
        const { buildMenuItemRow } = await load()
        const item = MENU.items[0]
        const a = buildMenuItemRow('t1', 'c1', item, 0, 1000)
        const b = buildMenuItemRow('t1', 'c1', item, 1, 1000)
        expect((a.variation_types[0] as { id: string }).id).not.toBe((b.variation_types[0] as { id: string }).id)
        expect((a.addons[0] as { id: string }).id).not.toBe((b.addons[0] as { id: string }).id)
    })

    test('throws a clear error on malformed menu data', async () => {
        const { importParsedMenu } = await load()
        const { client } = fakeClient()
        await expect(importParsedMenu(client, 't1', { categories: [] } as never)).rejects.toThrow(/Invalid menu data/)
    })
})
