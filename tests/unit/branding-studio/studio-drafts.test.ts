/**
 * Branding Studio safety net (brand editor v2, Phase 1): one draft over every
 * store, undo/redo with coalesced drags, a change list that only counts real
 * changes, typed clears (a toggle is never cleared to ''), and diff-only
 * publish payloads.
 */

import {
    EMPTY_DRAFTS,
    clearValue,
    clearValues,
    commit,
    createHistory,
    listChanges,
    redo,
    revertChange,
    setValue,
    tenantPublishPatch,
    productPublishPatch,
    undo,
    type SavedStores,
    type StudioDrafts,
} from '@/lib/branding-studio/studio-drafts'

const SAVED: SavedStores = {
    tenant: { accent_color: '#e4572e', primary_color: '#111111', senior_friendly_mode: true, font_pair: 'warm editorial' },
    product: { addon_text_color: '#ffffff' },
    mobile: { accent_color: '#000000' },
    mobileProduct: {},
}

function drafts(partial: Partial<StudioDrafts>): StudioDrafts {
    return { ...EMPTY_DRAFTS, ...partial }
}

describe('history', () => {
    it('undoes and redoes an edit', () => {
        const edited = commit(createHistory(), setValue(EMPTY_DRAFTS, 'tenant', 'accent_color', '#ff0000'), { key: null, at: 0 })

        const undone = undo(edited)
        const redone = redo(undone)

        expect(undone.present).toEqual(EMPTY_DRAFTS)
        expect(redone.present.tenant).toEqual({ accent_color: '#ff0000' })
    })

    it('folds a colour drag into one undo step', () => {
        let history = createHistory()
        for (const [index, color] of ['#100000', '#200000', '#300000'].entries()) {
            history = commit(history, setValue(history.present, 'tenant', 'accent_color', color), { key: 'tenant:accent_color', at: index * 100 })
        }

        expect(history.present.tenant.accent_color).toBe('#300000')
        expect(undo(history).present).toEqual(EMPTY_DRAFTS)
    })

    it('keeps separate steps for edits far apart in time', () => {
        let history = commit(createHistory(), setValue(EMPTY_DRAFTS, 'tenant', 'accent_color', '#100000'), { key: 'k', at: 0 })
        history = commit(history, setValue(history.present, 'tenant', 'accent_color', '#200000'), { key: 'k', at: 5000 })

        expect(undo(history).present.tenant.accent_color).toBe('#100000')
    })

    it('drops the redo trail after a new edit', () => {
        let history = commit(createHistory(), setValue(EMPTY_DRAFTS, 'tenant', 'accent_color', '#100000'), { key: null, at: 0 })
        history = undo(history)
        history = commit(history, setValue(history.present, 'tenant', 'primary_color', '#222222'), { key: null, at: 10 })

        expect(history.future).toEqual([])
    })

    it('ignores undo with nothing to undo', () => {
        const history = createHistory()

        expect(undo(history)).toBe(history)
    })
})

describe('clearing values', () => {
    it('drops a draft entry for a value that was never saved', () => {
        const next = clearValue(drafts({ tenant: { hero_title: 'Hi' } }), 'tenant', 'hero_title', SAVED)

        expect(next.tenant).toEqual({})
    })

    it('clears a saved colour with an empty string', () => {
        const next = clearValue(EMPTY_DRAFTS, 'tenant', 'accent_color', SAVED)

        expect(next.tenant).toEqual({ accent_color: '' })
    })

    it('clears a saved toggle or choice back to its default, never to an empty string', () => {
        const next = clearValues(EMPTY_DRAFTS, 'tenant', ['senior_friendly_mode', 'font_pair'], SAVED)

        expect(next.tenant).toEqual({ senior_friendly_mode: false, font_pair: 'theme' })
    })

    it('clears a phone override with an empty string (back to the computer value)', () => {
        const next = clearValue(EMPTY_DRAFTS, 'mobile', 'accent_color', SAVED)

        expect(next.mobile).toEqual({ accent_color: '' })
    })
})

describe('listChanges', () => {
    it('lists only values that differ from what is saved', () => {
        const changes = listChanges(drafts({
            tenant: { accent_color: '#e4572e', primary_color: '#222222' },
            product: { addon_text_color: '#000000' },
        }), SAVED)

        expect(changes.map((change) => `${change.store}:${change.fieldId}`)).toEqual([
            'tenant:primary_color',
            'product:addon_text_color',
        ])
    })

    it('labels each change and keeps before/after', () => {
        const [change] = listChanges(drafts({ tenant: { primary_color: '#222222' } }), SAVED)

        expect(change).toMatchObject({ before: '#111111', after: '#222222' })
        expect(change.label.length).toBeGreaterThan(0)
    })

    it('counts a clear of a saved value as a change', () => {
        expect(listChanges(drafts({ product: { addon_text_color: '' } }), SAVED)).toHaveLength(1)
    })

    it('counts menu layout edits as one change', () => {
        const changes = listChanges(drafts({ categories: { order: ['b', 'a'] } }), SAVED)

        expect(changes).toEqual([expect.objectContaining({ store: 'categories' })])
    })

    it('reverts one change and leaves the rest', () => {
        const next = revertChange(drafts({ tenant: { primary_color: '#222222', accent_color: '#000000' } }), 'tenant', 'primary_color')

        expect(next.tenant).toEqual({ accent_color: '#000000' })
    })
})

describe('publish patches', () => {
    it('sends only the tenant fields that changed', () => {
        const patch = tenantPublishPatch(drafts({ tenant: { primary_color: '#222222', accent_color: '#e4572e' } }), SAVED)

        expect(patch).toEqual({ primary_color: '#222222' })
    })

    it('is null when nothing on the store changed', () => {
        expect(tenantPublishPatch(EMPTY_DRAFTS, SAVED)).toBeNull()
        expect(productPublishPatch(EMPTY_DRAFTS, SAVED)).toBeNull()
    })

    it('folds phone overrides into the saved map', () => {
        const patch = tenantPublishPatch(drafts({ mobile: { accent_color: '', primary_color: '#333333' } }), SAVED)

        expect(patch).toEqual({ mobile_overrides: { primary_color: '#333333' } })
    })

    it('sends only the product fields that changed, as real columns', () => {
        const patch = productPublishPatch(drafts({ product: { addon_text_color: '#000000', not_a_column: 'x' } }), SAVED)

        expect(patch).toEqual({ addon_text_color: '#000000' })
    })
})

describe('publish patches pass the save schema', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { brandingPatchSchema } = require('@/lib/branding-service') as typeof import('@/lib/branding-service')

    it('clears a required colour back to its default, never to blank', () => {
        const cleared = clearValues(EMPTY_DRAFTS, 'tenant', ['primary_color', 'accent_color'], SAVED)
        const patch = tenantPublishPatch(cleared, SAVED)

        expect(patch?.primary_color).not.toBe('')
        expect(() => brandingPatchSchema.parse(patch)).not.toThrow()
    })

    it('accepts a phone-only patch', () => {
        const patch = tenantPublishPatch(drafts({ mobile: { primary_color: '#333333' } }), SAVED)

        expect(() => brandingPatchSchema.parse(patch)).not.toThrow()
    })

    it('accepts a cleared optional colour', () => {
        const patch = tenantPublishPatch(clearValue(EMPTY_DRAFTS, 'tenant', 'accent_color', SAVED), SAVED)

        expect(() => brandingPatchSchema.parse(patch)).not.toThrow()
    })
})

describe('label and colour-style fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { brandingPatchSchema } = require('@/lib/branding-service') as typeof import('@/lib/branding-service')

    it('publishes edited labels as the whole storefront_labels column', () => {
        const saved: SavedStores = { ...SAVED, tenant: { ...SAVED.tenant, storefront_labels: { 'cart.empty': 'Wala pa' } } }

        const patch = tenantPublishPatch(drafts({ tenant: { 'storefront_labels.cart.title': 'Your tray' } }), saved)

        expect(patch).toEqual({ storefront_labels: { 'cart.empty': 'Wala pa', 'cart.title': 'Your tray' } })
        expect(() => brandingPatchSchema.parse(patch)).not.toThrow()
    })

    it('publishes a section colour style', () => {
        const patch = tenantPublishPatch(drafts({ tenant: { 'section_schemes.header': 'brand' } }), SAVED)

        expect(patch).toEqual({ section_schemes: { header: 'brand' } })
        expect(() => brandingPatchSchema.parse(patch)).not.toThrow()
    })
})
