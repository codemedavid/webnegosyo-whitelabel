/**
 * Publish writes each store on its own and says which part failed: colours
 * that saved stay saved, the part that failed keeps its draft for a retry.
 * Only changed fields are sent, so a stale editor can't overwrite columns
 * another tool wrote meanwhile (e.g. the Hero Builder's hero_preset).
 */

import { EMPTY_DRAFTS, type SavedStores, type StudioDrafts } from '@/lib/branding-studio/studio-drafts'
import { publishStudio, type PublishActions } from '@/lib/branding-studio/publish-studio'

const SAVED: SavedStores = {
    tenant: { primary_color: '#111111', hero_preset: 'custom' },
    product: {},
    mobile: {},
    mobileProduct: {},
}

function actions(overrides: Partial<PublishActions> = {}): PublishActions {
    return {
        saveTenant: jest.fn().mockResolvedValue({ success: true }),
        saveProduct: jest.fn().mockResolvedValue({ success: true }),
        reorderCategories: jest.fn().mockResolvedValue({ success: true }),
        updateCategory: jest.fn().mockResolvedValue({ success: true }),
        ...overrides,
    }
}

function drafts(partial: Partial<StudioDrafts>): StudioDrafts {
    return { ...EMPTY_DRAFTS, ...partial }
}

describe('publishStudio', () => {
    it('sends only the changed tenant fields', async () => {
        const deps = actions()

        await publishStudio(deps, { drafts: drafts({ tenant: { primary_color: '#222222' } }), saved: SAVED, categories: [] })

        expect(deps.saveTenant).toHaveBeenCalledWith({ primary_color: '#222222' })
        expect(deps.saveProduct).not.toHaveBeenCalled()
    })

    it('keeps the store that published when a later store fails', async () => {
        const deps = actions({ saveProduct: jest.fn().mockResolvedValue({ success: false, error: 'nope' }) })

        const result = await publishStudio(deps, {
            drafts: drafts({ tenant: { primary_color: '#222222' }, product: { addon_text_color: '#000000' } }),
            saved: SAVED,
            categories: [],
        })

        expect(result.published).toEqual({ tenant: true, product: false })
        expect(result.failures).toEqual([{ part: 'Item page', error: 'nope' }])
    })

    it('still tries the item page when the store colours fail', async () => {
        const deps = actions({ saveTenant: jest.fn().mockResolvedValue({ success: false, error: 'bad colour' }) })

        const result = await publishStudio(deps, {
            drafts: drafts({ tenant: { primary_color: 'nope' }, product: { addon_text_color: '#000000' } }),
            saved: SAVED,
            categories: [],
        })

        expect(deps.saveProduct).toHaveBeenCalled()
        expect(result.published.product).toBe(true)
        expect(result.failures).toEqual([{ part: 'Store colours & layout', error: 'bad colour' }])
    })

    it('reports a thrown action as a failure of that part', async () => {
        const deps = actions({ saveTenant: jest.fn().mockRejectedValue(new Error('network down')) })

        const result = await publishStudio(deps, { drafts: drafts({ tenant: { primary_color: '#222222' } }), saved: SAVED, categories: [] })

        expect(result.failures).toEqual([{ part: 'Store colours & layout', error: 'network down' }])
    })

    it('publishes the menu layout and returns the new categories', async () => {
        const deps = actions()
        const categories = [{ id: 'a', name: 'A', order: 0 }, { id: 'b', name: 'B', order: 1 }] as never

        const result = await publishStudio(deps, { drafts: drafts({ categories: { order: ['b', 'a'] } }), saved: SAVED, categories })

        expect(deps.reorderCategories).toHaveBeenCalledWith(['b', 'a'])
        expect(result.publishedCategories?.map((category) => category.id)).toEqual(['b', 'a'])
    })

    it('does nothing when nothing changed', async () => {
        const deps = actions()

        const result = await publishStudio(deps, { drafts: EMPTY_DRAFTS, saved: SAVED, categories: [] })

        expect(deps.saveTenant).not.toHaveBeenCalled()
        expect(result.failures).toEqual([])
    })
})
