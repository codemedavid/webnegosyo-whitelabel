/**
 * Tests for src/lib/ai-menu-parser-utils.ts
 *
 * The AI menu parser (Llama 3.3 via OpenRouter) sometimes puts the same
 * flavor/option list that it already captured as `variations` back into
 * `description`, e.g. a "Fruit Soda Promo" item whose variations correctly
 * list flavor-combo options ("Strawberry • Lychee • Mango (+P110.00)", ...)
 * but whose description is a giant redundant dump of every flavor combo
 * concatenated with bullets. sanitizeParsedMenuItem/Data strip that
 * redundant text so it isn't shown twice to customers.
 */

import { describe, test, expect } from '@jest/globals'
import { sanitizeParsedMenuItem, sanitizeParsedMenuData } from '@/lib/ai-menu-parser-utils'
import type { ParsedMenuData, ParsedMenuItem } from '@/types/ai-menu-parser'

describe('sanitizeParsedMenuItem', () => {
    test('strips description that only re-lists the item\'s variation options', () => {
        const item: ParsedMenuItem = {
            name: 'Fruit Soda Promo',
            description:
                'Strawberry • Lychee • Mango • Strawberry • Lychee • Green Apple • ' +
                'Strawberry • Lychee • Blueberry • Strawberry • Mango • Green Apple',
            category: 'Fruit Soda Series',
            price: 219.99,
            variations: [
                {
                    name: 'Choose Size',
                    isRequired: true,
                    options: [
                        { name: 'Strawberry • Lychee • Mango', priceModifier: 0 },
                        { name: 'Strawberry • Lychee • Green Apple', priceModifier: 0 },
                        { name: 'Strawberry • Lychee • Blueberry', priceModifier: 0 },
                        { name: 'Strawberry • Mango • Green Apple', priceModifier: 110 },
                    ],
                },
            ],
            note: 'Choose any 3 from the following',
        }

        const sanitized = sanitizeParsedMenuItem(item)

        expect(sanitized.description).toBeUndefined()
        // Everything else is untouched
        expect(sanitized.variations).toEqual(item.variations)
        expect(sanitized.note).toBe(item.note)
        expect(sanitized.name).toBe(item.name)
    })

    test('keeps a genuinely informative description untouched', () => {
        const item: ParsedMenuItem = {
            name: 'Classic Burger',
            description: 'Juicy beef patty with lettuce, tomato, and our special sauce',
            category: 'Burgers',
            price: 120,
            variations: [
                {
                    name: 'Size',
                    isRequired: true,
                    options: [
                        { name: 'Solo', priceModifier: 0 },
                        { name: 'Box of 6', priceModifier: 200 },
                    ],
                },
            ],
        }

        const sanitized = sanitizeParsedMenuItem(item)

        expect(sanitized.description).toBe(item.description)
    })

    test('does not touch items with no variations', () => {
        const item: ParsedMenuItem = {
            name: 'Plain Item',
            description: 'Strawberry, Lychee, Mango',
            category: 'Misc',
            price: 50,
        }

        const sanitized = sanitizeParsedMenuItem(item)

        expect(sanitized.description).toBe('Strawberry, Lychee, Mango')
    })

    test('does not touch items with no description', () => {
        const item: ParsedMenuItem = {
            name: 'No Description Item',
            category: 'Misc',
            price: 50,
            variations: [
                { name: 'Size', isRequired: true, options: [{ name: 'Solo', priceModifier: 0 }] },
            ],
        }

        const sanitized = sanitizeParsedMenuItem(item)

        expect(sanitized.description).toBeUndefined()
    })

    test('a single word that happens to match an option name is kept (not a dumped list)', () => {
        const item: ParsedMenuItem = {
            name: 'Spicy Wings',
            description: 'Spicy',
            category: 'Wings',
            price: 150,
            variations: [
                { name: 'Spice Level', isRequired: true, options: [{ name: 'Spicy', priceModifier: 0 }] },
            ],
        }

        const sanitized = sanitizeParsedMenuItem(item)

        expect(sanitized.description).toBe('Spicy')
    })

    test('does not mutate the original item object', () => {
        const item: ParsedMenuItem = {
            name: 'Fruit Soda Promo',
            description: 'Strawberry • Lychee • Mango',
            category: 'Fruit Soda Series',
            price: 219.99,
            variations: [
                {
                    name: 'Choose Size',
                    isRequired: true,
                    options: [{ name: 'Strawberry • Lychee • Mango', priceModifier: 0 }],
                },
            ],
        }
        const originalDescription = item.description

        sanitizeParsedMenuItem(item)

        expect(item.description).toBe(originalDescription)
    })
})

describe('sanitizeParsedMenuData', () => {
    test('sanitizes every item and leaves categories untouched', () => {
        const data: ParsedMenuData = {
            categories: [{ name: 'Fruit Soda Series', description: 'Refreshing soda drinks' }],
            items: [
                {
                    name: 'Fruit Soda Promo',
                    description: 'Strawberry • Lychee • Mango',
                    category: 'Fruit Soda Series',
                    price: 219.99,
                    variations: [
                        {
                            name: 'Choose Size',
                            isRequired: true,
                            options: [{ name: 'Strawberry • Lychee • Mango', priceModifier: 0 }],
                        },
                    ],
                },
                {
                    name: 'Classic Burger',
                    description: 'Juicy beef patty',
                    category: 'Burgers',
                    price: 120,
                },
            ],
        }

        const sanitized = sanitizeParsedMenuData(data)

        expect(sanitized.categories).toEqual(data.categories)
        expect(sanitized.items[0].description).toBeUndefined()
        expect(sanitized.items[1].description).toBe('Juicy beef patty')
    })
})
