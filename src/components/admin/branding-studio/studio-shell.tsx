'use client'

/**
 * The Studio's frame around the settings: the screen picker and the settings
 * panel. On a computer they are a dark icon rail and a side panel; on a phone
 * the picker is a row of chips and the settings are a bottom sheet over the
 * preview (peek / half / full), so the page stays visible while editing.
 * Pure CSS breakpoints — nothing here measures the window.
 */

import type { ReactNode } from 'react'
import type { BrandingSurface } from '@/lib/branding-registry'

export type SheetSize = 'peek' | 'half' | 'full'

const NEXT_SIZE: Record<SheetSize, SheetSize> = { peek: 'half', half: 'full', full: 'peek' }

/** What a tap on the sheet's handle does: peek → half → full → peek. */
export function nextSheetSize(size: SheetSize): SheetSize {
    return NEXT_SIZE[size]
}

interface SurfaceRailProps {
    surfaces: readonly BrandingSurface[]
    activeId: BrandingSurface['id']
    onPick: (id: BrandingSurface['id']) => void
}

export function SurfaceRail({ surfaces, activeId, onPick }: SurfaceRailProps) {
    return (
        <nav
            aria-label="Screens"
            className="flex flex-shrink-0 gap-1 overflow-x-auto bg-[#1D1815] px-2 py-2 md:w-[84px] md:flex-col md:items-center md:overflow-x-visible md:overflow-y-auto md:py-3"
        >
            {surfaces.map((surface) => {
                const isActive = surface.id === activeId
                return (
                    <button
                        key={surface.id}
                        type="button"
                        onClick={() => onPick(surface.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex min-h-11 flex-shrink-0 items-center gap-2 rounded-[10px] px-3 transition-colors hover:bg-white/15 md:w-[68px] md:flex-col md:gap-1.5 md:px-0.5 md:pb-2 md:pt-2 ${
                            isActive ? 'bg-white/15 text-white' : 'text-white/60'
                        }`}
                    >
                        <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-[7px] text-[12px] font-black ${
                                isActive ? 'bg-amber-500 text-[#1D1815]' : 'bg-white/10 text-white/70'
                            }`}
                        >
                            {surface.glyph}
                        </span>
                        <span className="whitespace-nowrap text-center text-[12px] font-bold leading-[1.15] tracking-wide md:whitespace-normal md:text-[9.5px]">
                            {surface.label}
                        </span>
                    </button>
                )
            })}
        </nav>
    )
}

interface SettingsSheetProps {
    /** Phone only; ignored on a computer, where the panel is always open. */
    size: SheetSize
    onSizeChange: (size: SheetSize) => void
    /** Shown on the handle while the sheet only peeks. */
    title: string
    children: ReactNode
}

const SHEET_HEIGHT: Record<SheetSize, string> = {
    peek: 'max-md:h-[64px]',
    half: 'max-md:h-[48dvh]',
    full: 'max-md:h-[90dvh]',
}

// Room the preview keeps free below it, so the part being edited (often a
// sticky footer) stays visible above the sheet. Full keeps the half inset:
// the sheet covers the page anyway.
const PREVIEW_INSET: Record<SheetSize, string> = {
    peek: 'max-md:pb-[64px]',
    half: 'max-md:pb-[48dvh]',
    full: 'max-md:pb-[48dvh]',
}

/** Phone padding for the preview under a sheet of this size. */
export function previewInsetFor(size: SheetSize): string {
    return PREVIEW_INSET[size]
}

export function SettingsSheet({ size, onSizeChange, title, children }: SettingsSheetProps) {
    return (
        <aside
            aria-label="Settings"
            data-sheet={size}
            className={`flex flex-col bg-white transition-[height] duration-200 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:rounded-t-2xl max-md:shadow-[0_-12px_40px_rgba(30,22,12,0.22)] md:w-[336px] md:flex-shrink-0 md:border-r md:border-[#E5E0D6] ${SHEET_HEIGHT[size]}`}
        >
            <button
                type="button"
                onClick={() => onSizeChange(nextSheetSize(size))}
                aria-label={size === 'full' ? 'Shrink settings' : 'Show more settings'}
                className="flex min-h-11 w-full flex-shrink-0 flex-col items-center justify-center gap-1 md:hidden"
            >
                <span aria-hidden="true" className="h-1 w-10 rounded-full bg-neutral-300" />
                {size === 'peek' && <span className="text-[12.5px] font-extrabold text-[#1D1815]">{title} settings</span>}
            </button>
            <div className={`flex min-h-0 flex-1 flex-col ${size === 'peek' ? 'max-md:hidden' : ''}`}>{children}</div>
        </aside>
    )
}
