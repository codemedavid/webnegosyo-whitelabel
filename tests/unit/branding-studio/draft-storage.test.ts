/**
 * Unpublished Studio edits survive a reload or a closed tab: the draft is kept
 * in the browser and offered back. Anything malformed is ignored, never trusted.
 */

import { EMPTY_DRAFTS } from '@/lib/branding-studio/studio-drafts'
import { parseDraftSnapshot, serializeDraftSnapshot } from '@/lib/branding-studio/draft-storage'

describe('draft snapshots', () => {
    it('round-trips a draft with when it was kept', () => {
        const drafts = { ...EMPTY_DRAFTS, tenant: { accent_color: '#ff0000' } }

        const parsed = parseDraftSnapshot(serializeDraftSnapshot(drafts, 1_700_000_000_000))

        expect(parsed).toEqual({ drafts, savedAt: 1_700_000_000_000 })
    })

    it('ignores text that is not a snapshot', () => {
        expect(parseDraftSnapshot(null)).toBeNull()
        expect(parseDraftSnapshot('not json')).toBeNull()
        expect(parseDraftSnapshot('{"drafts":{"tenant":"x"},"savedAt":1}')).toBeNull()
        expect(parseDraftSnapshot('{"drafts":[],"savedAt":1}')).toBeNull()
    })

    it('fills stores missing from an older snapshot', () => {
        const parsed = parseDraftSnapshot('{"drafts":{"tenant":{"accent_color":"#000000"}},"savedAt":5}')

        expect(parsed?.drafts).toEqual({ ...EMPTY_DRAFTS, tenant: { accent_color: '#000000' } })
    })

    it('drops keys that could poison an object', () => {
        const parsed = parseDraftSnapshot('{"drafts":{"tenant":{"__proto__":{"x":1},"accent_color":"#000000"}},"savedAt":5}')

        expect(Object.keys(parsed?.drafts.tenant ?? {})).toEqual(['accent_color'])
    })
})
