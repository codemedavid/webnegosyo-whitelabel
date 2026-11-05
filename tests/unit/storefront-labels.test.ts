/**
 * Owner wording for storefront labels: only known keys, trimmed, within
 * length; anything else is ignored on read and refused on write.
 */

import { fillLabelCount, readStorefrontLabels, storefrontLabelsSchema, STOREFRONT_LABELS } from '@/lib/storefront-labels'
import { ITEM_NOTE_TITLE_FALLBACK } from '@/components/customer/item-note-field'

describe('readStorefrontLabels', () => {
    it('keeps the owner\'s words for known labels', () => {
        expect(readStorefrontLabels({ storefront_labels: { 'cart.title': '  Your tray ' } })).toEqual({ 'cart.title': 'Your tray' })
    })

    it('ignores unknown keys, blanks, non-text and over-long text', () => {
        const labels = readStorefrontLabels({
            storefront_labels: {
                'cart.title': '',
                'nope.key': 'x',
                'cart.total': 5,
                'menu.add': 'x'.repeat(STOREFRONT_LABELS['menu.add'].maxLength + 1),
            },
        })

        expect(labels).toEqual({})
    })

    it('reads nothing from a missing or malformed column', () => {
        expect(readStorefrontLabels(null)).toEqual({})
        expect(readStorefrontLabels({ storefront_labels: ['cart.title'] })).toEqual({})
    })
})

describe('storefrontLabelsSchema', () => {
    it('accepts known labels', () => {
        expect(storefrontLabelsSchema.parse({ 'checkout.payment': 'Bayad' })).toEqual({ 'checkout.payment': 'Bayad' })
    })

    it('refuses unknown keys and over-long text', () => {
        expect(() => storefrontLabelsSchema.parse({ 'nope.key': 'x' })).toThrow()
        expect(() => storefrontLabelsSchema.parse({ 'menu.add': 'x'.repeat(100) })).toThrow()
    })
})

describe('item note wording', () => {
    // One wording for the note on every web screen (owner's call, 2026-11-04).
    it('defaults to "Note for the kitchen" and stays the owner\'s to change', () => {
        expect(STOREFRONT_LABELS['item.note_title'].example).toBe('Note for the kitchen')
        expect(ITEM_NOTE_TITLE_FALLBACK).toBe('Note for the kitchen')
        expect(storefrontLabelsSchema.parse({ 'item.note_title': 'Para sa kusina' })).toEqual({ 'item.note_title': 'Para sa kusina' })
    })
})

describe('menu.only_left ("Only {count} left")', () => {
    it('is a menu label the owner can translate', () => {
        expect(STOREFRONT_LABELS['menu.only_left']).toMatchObject({ screen: 'menu', example: 'Only {count} left' })
        expect(storefrontLabelsSchema.parse({ 'menu.only_left': '{count} na lang' })).toEqual({ 'menu.only_left': '{count} na lang' })
    })

    it('puts the number where {count} is', () => {
        expect(fillLabelCount('Only {count} left', 3)).toBe('Only 3 left')
        expect(fillLabelCount('{count} na lang! ({count})', 2)).toBe('2 na lang! (2)')
    })

    it('keeps the owner\'s words as typed when they left {count} out', () => {
        expect(fillLabelCount('Almost gone', 4)).toBe('Almost gone')
    })
})
