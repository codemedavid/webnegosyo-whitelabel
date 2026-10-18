/**
 * The Studio hook: edits are undoable, a partial publish keeps only the
 * failed store's draft, and unpublished work is offered back after a reload.
 */

import { act, renderHook } from '@testing-library/react'
import { useStudioDrafts } from '@/components/admin/branding-studio/use-studio-drafts'
import { draftStorageKey, serializeDraftSnapshot } from '@/lib/branding-studio/draft-storage'
import { EMPTY_DRAFTS } from '@/lib/branding-studio/studio-drafts'
import type { Tenant } from '@/types/database'

const TENANT = { id: 'tenant-1', primary_color: '#111111', mobile_overrides: {} } as unknown as Tenant

function renderStudio() {
    return renderHook(() => useStudioDrafts({ tenant: TENANT, productSettings: {}, categories: [] }))
}

beforeEach(() => {
    window.localStorage.clear()
    jest.useFakeTimers()
})

afterEach(() => {
    jest.useRealTimers()
})

describe('useStudioDrafts', () => {
    it('counts a change, undoes it, and redoes it', () => {
        const { result } = renderStudio()

        act(() => result.current.setField('tenant', 'primary_color', '#222222'))
        expect(result.current.changes).toHaveLength(1)

        act(() => result.current.undo())
        expect(result.current.changes).toHaveLength(0)

        act(() => result.current.redo())
        expect(result.current.drafts.tenant.primary_color).toBe('#222222')
    })

    it('does not count an edit back to the published value', () => {
        const { result } = renderStudio()

        act(() => result.current.setField('tenant', 'primary_color', '#111111'))

        expect(result.current.changes).toHaveLength(0)
    })

    it('keeps only the failed store after a partial publish', () => {
        const { result } = renderStudio()
        act(() => {
            result.current.setField('tenant', 'primary_color', '#222222')
            result.current.setField('product', 'addon_text_color', '#000000')
        })

        const sent = result.current.drafts
        act(() => result.current.markPublished({ tenant: true, product: false }, sent, null, null))

        expect(result.current.savedTenant.primary_color).toBe('#222222')
        expect(result.current.drafts.tenant).toEqual({})
        expect(result.current.drafts.product).toEqual({ addon_text_color: '#000000' })
    })

    it('keeps edits made while a publish was in flight', () => {
        const { result } = renderStudio()
        act(() => result.current.setField('tenant', 'primary_color', '#222222'))
        const sent = result.current.drafts

        act(() => result.current.setField('tenant', 'accent_color', '#ff0000'))
        act(() => result.current.markPublished({ tenant: true }, sent, null, null))

        expect(result.current.drafts.tenant).toEqual({ accent_color: '#ff0000' })
        expect(result.current.savedTenant.primary_color).toBe('#222222')
    })

    it('offers back unpublished work from the last visit', () => {
        window.localStorage.setItem(
            draftStorageKey('tenant-1'),
            serializeDraftSnapshot({ ...EMPTY_DRAFTS, tenant: { primary_color: '#333333' } }, 1_700_000_000_000),
        )

        const { result } = renderStudio()
        expect(result.current.pendingRestore?.savedAt).toBe(1_700_000_000_000)

        act(() => result.current.restore())
        expect(result.current.drafts.tenant.primary_color).toBe('#333333')
        expect(result.current.pendingRestore).toBeNull()
    })

    it('keeps unpublished work in the browser and forgets it once nothing is left', () => {
        const { result } = renderStudio()

        act(() => result.current.setField('tenant', 'primary_color', '#444444'))
        act(() => jest.advanceTimersByTime(1000))
        expect(window.localStorage.getItem(draftStorageKey('tenant-1'))).toContain('#444444')

        act(() => result.current.discardAll())
        act(() => jest.advanceTimersByTime(1000))
        expect(window.localStorage.getItem(draftStorageKey('tenant-1'))).toBeNull()
    })
})
