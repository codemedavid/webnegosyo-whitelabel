/**
 * Tests for the AI menu parser v2 post-processing pipeline in
 * src/lib/ai-menu-parser-utils.ts:
 *
 * - normalizeParsedMenuData: hardens raw AI output (string prices like
 *   "₱1,350", items referencing categories the AI forgot to list, junk
 *   items with no name, empty variation groups).
 * - applyAddonGroups: distributes shared add-on sections (extracted once
 *   as `addonGroups` with `appliesTo`) onto the matching items, deduped.
 * - finalizeParsedMenuData: normalize → apply addon groups → sanitize.
 */

import { describe, test, expect } from '@jest/globals'
import {
    normalizeParsedMenuData,
    applyAddonGroups,
    finalizeParsedMenuData,
} from '@/lib/ai-menu-parser-utils'
import type { ParsedMenuData } from '@/types/ai-menu-parser'

describe('normalizeParsedMenuData', () => {
    test('coerces string prices with currency symbols and commas to numbers', () => {
        const raw = {
            categories: [{ name: 'Cakes' }],
            items: [
                { name: 'Ube Cake', category: 'Cakes', price: '₱1,350' },
                { name: 'Mango Cake', category: 'Cakes', price: 'P150.50' },
            ],
        }

        const normalized = normalizeParsedMenuData(raw)

        expect(normalized.items[0].price).toBe(1350)
        expect(normalized.items[1].price).toBe(150.5)
    })

    test('defaults invalid or negative prices to 0', () => {
        const raw = {
            categories: [{ name: 'Cakes' }],
            items: [
                { name: 'Mystery', category: 'Cakes', price: 'call us' },
                { name: 'Negative', category: 'Cakes', price: -50 },
            ],
        }

        const normalized = normalizeParsedMenuData(raw)

        expect(normalized.items[0].price).toBe(0)
        expect(normalized.items[1].price).toBe(0)
    })

    test('drops items without a name and categories without a name', () => {
        const raw = {
            categories: [{ name: 'Cakes' }, { name: '' }, {}],
            items: [
                { name: 'Ube Cake', category: 'Cakes', price: 100 },
                { name: '', category: 'Cakes', price: 100 },
                { category: 'Cakes', price: 100 },
            ],
        }

        const normalized = normalizeParsedMenuData(raw)

        expect(normalized.items).toHaveLength(1)
        expect(normalized.categories).toHaveLength(1)
    })

    test('appends a category when an item references one the AI forgot to list', () => {
        const raw = {
            categories: [{ name: 'Cakes' }],
            items: [{ name: 'Iced Latte', category: 'Drinks', price: 120 }],
        }

        const normalized = normalizeParsedMenuData(raw)

        expect(normalized.categories.map(c => c.name)).toContain('Drinks')
    })

    test('dedupes categories case-insensitively keeping the first occurrence', () => {
        const raw = {
            categories: [
                { name: 'Drinks', icon: '🥤' },
                { name: 'drinks' },
            ],
            items: [],
        }

        const normalized = normalizeParsedMenuData(raw)

        expect(normalized.categories).toHaveLength(1)
        expect(normalized.categories[0].icon).toBe('🥤')
    })

    test('coerces variation price modifiers and drops variation groups with no options', () => {
        const raw = {
            categories: [{ name: 'Drinks' }],
            items: [
                {
                    name: 'Milk Tea',
                    category: 'Drinks',
                    price: 100,
                    variations: [
                        {
                            name: 'Size',
                            isRequired: true,
                            options: [
                                { name: 'Regular', priceModifier: 0 },
                                { name: 'Large', priceModifier: '+P20' },
                            ],
                        },
                        { name: 'Empty Group', isRequired: false, options: [] },
                    ],
                },
            ],
        }

        const normalized = normalizeParsedMenuData(raw)

        const variations = normalized.items[0].variations
        expect(variations).toHaveLength(1)
        expect(variations?.[0].options[1].priceModifier).toBe(20)
    })

    test('coerces addon prices on items', () => {
        const raw = {
            categories: [{ name: 'Drinks' }],
            items: [
                {
                    name: 'Milk Tea',
                    category: 'Drinks',
                    price: 100,
                    addons: [{ name: 'Pearls', price: 'P20' }],
                },
            ],
        }

        const normalized = normalizeParsedMenuData(raw)

        expect(normalized.items[0].addons?.[0].price).toBe(20)
    })

    test('returns empty structure for completely invalid input', () => {
        expect(normalizeParsedMenuData(null)).toEqual({ categories: [], items: [] })
        expect(normalizeParsedMenuData('garbage')).toEqual({ categories: [], items: [] })
    })
})

describe('applyAddonGroups', () => {
    const baseData: ParsedMenuData = {
        categories: [{ name: 'Milk Tea' }, { name: 'Cakes' }],
        items: [
            { name: 'Wintermelon', category: 'Milk Tea', price: 100 },
            { name: 'Okinawa', category: 'Milk Tea', price: 110 },
            { name: 'Ube Cake', category: 'Cakes', price: 500 },
        ],
        addonGroups: [
            {
                name: 'Milk Tea Add-ons',
                appliesTo: ['Milk Tea'],
                addons: [
                    { name: 'Pearls', price: 20 },
                    { name: 'Cream Cheese', price: 30 },
                ],
            },
        ],
    }

    test('attaches group addons to every item in matching categories only', () => {
        const result = applyAddonGroups(baseData)

        expect(result.items[0].addons).toEqual([
            { name: 'Pearls', price: 20 },
            { name: 'Cream Cheese', price: 30 },
        ])
        expect(result.items[1].addons).toEqual(result.items[0].addons)
        expect(result.items[2].addons).toBeUndefined()
    })

    test('matches category names case-insensitively', () => {
        const data: ParsedMenuData = {
            ...baseData,
            addonGroups: [
                { name: 'g', appliesTo: ['milk tea'], addons: [{ name: 'Pearls', price: 20 }] },
            ],
        }

        const result = applyAddonGroups(data)

        expect(result.items[0].addons).toEqual([{ name: 'Pearls', price: 20 }])
    })

    test('"*" applies the group to all items', () => {
        const data: ParsedMenuData = {
            ...baseData,
            addonGroups: [
                { name: 'g', appliesTo: ['*'], addons: [{ name: 'Extra Cup', price: 5 }] },
            ],
        }

        const result = applyAddonGroups(data)

        expect(result.items.every(item =>
            item.addons?.some(a => a.name === 'Extra Cup')
        )).toBe(true)
    })

    test('matches specific item names too', () => {
        const data: ParsedMenuData = {
            ...baseData,
            addonGroups: [
                { name: 'g', appliesTo: ['Ube Cake'], addons: [{ name: 'Candles', price: 10 }] },
            ],
        }

        const result = applyAddonGroups(data)

        expect(result.items[2].addons).toEqual([{ name: 'Candles', price: 10 }])
        expect(result.items[0].addons).toBeUndefined()
    })

    test('does not duplicate an addon the item already has (item price wins)', () => {
        const data: ParsedMenuData = {
            ...baseData,
            items: [
                {
                    name: 'Wintermelon',
                    category: 'Milk Tea',
                    price: 100,
                    addons: [{ name: 'Pearls', price: 25 }],
                },
            ],
        }

        const result = applyAddonGroups(data)

        const pearls = result.items[0].addons?.filter(a => a.name.toLowerCase() === 'pearls')
        expect(pearls).toHaveLength(1)
        expect(pearls?.[0].price).toBe(25)
    })

    test('strips addonGroups from the result and does not mutate the input', () => {
        const result = applyAddonGroups(baseData)

        expect(result.addonGroups).toBeUndefined()
        expect(baseData.items[0].addons).toBeUndefined()
        expect(baseData.addonGroups).toHaveLength(1)
    })

    test('is a no-op when there are no addon groups', () => {
        const data: ParsedMenuData = { categories: [], items: [{ name: 'A', category: 'X', price: 1 }] }

        const result = applyAddonGroups(data)

        expect(result.items).toEqual(data.items)
    })
})

describe('finalizeParsedMenuData', () => {
    test('runs the full pipeline: normalize, distribute addon groups, sanitize descriptions', () => {
        const raw = {
            categories: [{ name: 'Milk Tea' }],
            items: [
                {
                    name: 'Fruit Soda Promo',
                    category: 'Fruit Soda',
                    price: 'P219.99',
                    description: 'Strawberry • Lychee • Mango',
                    variations: [
                        {
                            name: 'Flavor',
                            isRequired: true,
                            options: [
                                { name: 'Strawberry', priceModifier: 0 },
                                { name: 'Lychee', priceModifier: 0 },
                                { name: 'Mango', priceModifier: 0 },
                            ],
                        },
                    ],
                },
            ],
            addonGroups: [
                { name: 'g', appliesTo: ['Fruit Soda'], addons: [{ name: 'Pearls', price: '20' }] },
            ],
        }

        const result = finalizeParsedMenuData(raw)

        expect(result.items[0].price).toBe(219.99)
        // redundant option-list description stripped by sanitizer
        expect(result.items[0].description).toBeUndefined()
        // addon group distributed with coerced price
        expect(result.items[0].addons).toEqual([{ name: 'Pearls', price: 20 }])
        // missing category appended by normalizer
        expect(result.categories.map(c => c.name)).toContain('Fruit Soda')
        expect(result.addonGroups).toBeUndefined()
    })
})
