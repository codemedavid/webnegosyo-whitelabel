'use client'

/**
 * "Parts on this screen": every tappable part as a list, so a keyboard or
 * screen-reader user can pick what to edit without pointing at the preview.
 */

import { componentTree } from '@/lib/branding-components'
import type { BrandingSurface } from '@/lib/branding-registry'

interface PartsListProps {
    surfaceId: BrandingSurface['id']
    onSelect: (scope: string) => void
}

export function PartsList({ surfaceId, onSelect }: PartsListProps) {
    const tree = componentTree(surfaceId)
    if (tree.length === 0) return null
    return (
        <details className="border-b border-[#E5E0D6] px-[18px] py-3">
            <summary className="cursor-pointer text-[12px] font-extrabold text-[#5E574C]">Parts on this screen</summary>
            <ul className="mt-2 flex flex-col gap-0.5" aria-label="Parts on this screen">
                {tree.map(({ component, children }) => (
                    <li key={component.id}>
                        <PartButton label={component.label} onClick={() => onSelect(component.id)} />
                        {children.length > 0 && (
                            <ul className="ml-3 border-l border-[#E5E0D6] pl-2">
                                {children.map((child) => (
                                    <li key={child.id}>
                                        <PartButton label={child.label} onClick={() => onSelect(child.id)} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ul>
        </details>
    )
}

function PartButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="min-h-8 w-full rounded-md px-2 py-1 text-left text-[12.5px] font-semibold text-[#1D1815] hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-[#2A6FDB]"
        >
            {label}
        </button>
    )
}
