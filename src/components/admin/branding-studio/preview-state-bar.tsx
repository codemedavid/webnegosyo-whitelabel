'use client'

/**
 * "Show in preview" toggles for item-page parts the previewed dish may not
 * have. Samples the Studio turns on by itself (for the setting being edited)
 * show as on and can't be switched off while that setting is in focus.
 */

import { PRODUCT_PREVIEW_STATES, type ProductPreviewState } from '@/lib/branding-studio/preview-states'

interface PreviewStateBarProps {
    chosen: ReadonlySet<ProductPreviewState>
    automatic: ReadonlySet<ProductPreviewState>
    onToggle: (state: ProductPreviewState) => void
}

export function PreviewStateBar({ chosen, automatic, onToggle }: PreviewStateBarProps) {
    return (
        <div role="group" aria-label="Show in preview" className="mx-auto mt-3 flex max-w-full flex-wrap items-center justify-center gap-1.5 max-md:mt-2 max-md:flex-nowrap max-md:justify-start max-md:overflow-x-auto max-md:px-2">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">Show</span>
            {PRODUCT_PREVIEW_STATES.map((state) => {
                const isAutomatic = automatic.has(state.id)
                const isOn = isAutomatic || chosen.has(state.id)
                return (
                    <button
                        key={state.id}
                        type="button"
                        aria-pressed={isOn}
                        disabled={isAutomatic}
                        onClick={() => onToggle(state.id)}
                        title={isAutomatic ? 'Shown while you edit this setting' : undefined}
                        className={`rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
                            isOn ? 'border-[#2A6FDB] bg-[#2A6FDB] text-white' : 'border-[#D8D2C6] bg-white text-[#5E574C] hover:border-[#1D1815]'
                        } disabled:cursor-default`}
                    >
                        {state.label}
                    </button>
                )
            })}
        </div>
    )
}
