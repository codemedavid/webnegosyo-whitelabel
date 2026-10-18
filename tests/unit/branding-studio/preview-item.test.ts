/**
 * The Item screen previews a dish that shows the most of the page: option
 * groups and add-ons, ideally with a photo — not just the first dish, which
 * may have nothing to style (owner, 2026-10-18).
 */

import { pickPreviewItemId } from '@/lib/branding-studio/preview-item'
import type { MenuItem } from '@/types/database'

function dish(id: string, extra: Partial<MenuItem> = {}): MenuItem {
    return { id, name: id, image_url: '', variations: [], addons: [], ...extra } as unknown as MenuItem
}

describe('pickPreviewItemId', () => {
    it('prefers the dish with the most to style', () => {
        const items = [
            dish('plain'),
            dish('one-group', { modifier_groups: [{ id: 'g' }] as never }),
            dish('groups-and-addons', { modifier_groups: [{ id: 'g' }, { id: 'h' }] as never, addons: [{ id: 'a' }] as never }),
        ]

        expect(pickPreviewItemId(items, null)).toBe('groups-and-addons')
    })

    it('breaks ties with a photo', () => {
        const items = [dish('no-photo', { addons: [{ id: 'a' }] as never }), dish('photo', { addons: [{ id: 'a' }] as never, image_url: 'x.jpg' })]

        expect(pickPreviewItemId(items, null)).toBe('photo')
    })

    it('uses the dish the owner came from when it is on this menu', () => {
        expect(pickPreviewItemId([dish('a', { addons: [{ id: 'x' }] as never }), dish('b')], 'b')).toBe('b')
    })

    it('ignores a dish that is not on this menu', () => {
        expect(pickPreviewItemId([dish('a')], 'other-store-dish')).toBe('a')
    })

    it('is null with no dishes', () => {
        expect(pickPreviewItemId([], null)).toBeNull()
    })
})
