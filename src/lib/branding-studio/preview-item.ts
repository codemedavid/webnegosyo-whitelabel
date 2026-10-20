/**
 * Which dish the Studio's Item screen previews: the one the owner came from
 * ("Edit look" on a dish) when it is on this menu, else the dish with the most
 * to style — option groups, then add-ons, then a photo.
 */

import type { MenuItem } from '@/types/database'

type PreviewCandidate = Pick<MenuItem, 'id' | 'image_url' | 'variations' | 'addons' | 'variation_types' | 'modifier_groups'>

function styleScore(item: PreviewCandidate): number {
    const groups = (item.modifier_groups?.length ?? 0) + (item.variation_types?.length ?? 0) + (item.variations?.length ? 1 : 0)
    const addons = item.addons?.length ? 1 : 0
    const photo = item.image_url ? 0.5 : 0
    return groups * 2 + addons * 2 + photo
}

export function pickPreviewItemId(items: readonly PreviewCandidate[], requestedId: string | null | undefined): string | null {
    if (requestedId && items.some((item) => item.id === requestedId)) return requestedId
    const best = items.reduce<PreviewCandidate | null>(
        (winner, item) => (!winner || styleScore(item) > styleScore(winner) ? item : winner),
        null,
    )
    return best?.id ?? null
}
