'use client'

/**
 * Colour picker for Studio rows (brand editor v2, Phase 3): pick one of the
 * store's own colours first ("Brand", "Cards", "Text"…), then a custom colour
 * by hex or the system picker. Owners pick roles, not hex codes.
 */

import { useEffect, useId, useRef, useState } from 'react'

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
/** Room the popover needs below its trigger before it opens upward instead. */
const POPOVER_HEIGHT_PX = 280

export interface StoreColor {
    label: string
    color: string
}

interface ColorPickerProps {
    label: string
    value: string
    storeColors: readonly StoreColor[]
    onChange: (color: string) => void
    /** Clear back to what the field follows; absent when there is nothing to go back to. */
    onUseDefault?: () => void
    defaultLabel?: string
    isSet: boolean
}

function normalizeHex(text: string): string | null {
    const trimmed = text.trim()
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
    return HEX_COLOR.test(withHash) ? withHash.toLowerCase() : null
}

export function ColorPicker({ label, value, storeColors, onChange, onUseDefault, defaultLabel, isSet }: ColorPickerProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [hexDraft, setHexDraft] = useState(value)
    const containerRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const firstSwatchRef = useRef<HTMLButtonElement>(null)
    const [opensUp, setOpensUp] = useState(false)
    const popoverId = useId()
    const pickerHex = HEX_COLOR.test(value) ? value : '#000000'

    useEffect(() => setHexDraft(value), [value])

    useEffect(() => {
        if (!isOpen) return
        firstSwatchRef.current?.focus()
        const onOutside = (event: MouseEvent | FocusEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            // The picker owns this Esc: the Studio must not also step out of a selection.
            event.preventDefault()
            event.stopPropagation()
            setIsOpen(false)
            triggerRef.current?.focus()
        }
        window.addEventListener('mousedown', onOutside)
        window.addEventListener('focusin', onOutside)
        window.addEventListener('keydown', onKeyDown, true)
        return () => {
            window.removeEventListener('mousedown', onOutside)
            window.removeEventListener('focusin', onOutside)
            window.removeEventListener('keydown', onKeyDown, true)
        }
    }, [isOpen])

    const commitHex = () => {
        const hex = normalizeHex(hexDraft)
        // Unchanged text must not pin a followed colour as an override.
        if (hex && hex !== value.toLowerCase()) onChange(hex)
        else setHexDraft(value)
    }

    const close = () => {
        setIsOpen(false)
        triggerRef.current?.focus()
    }

    const open = () => {
        // Open upward when the row sits low in the panel (the panel scrolls).
        const rect = triggerRef.current?.getBoundingClientRect()
        setOpensUp(Boolean(rect && window.innerHeight - rect.bottom < POPOVER_HEIGHT_PX))
        setIsOpen(true)
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => (isOpen ? close() : open())}
                aria-label={`${label}: ${value || 'not set'}${isSet ? '' : defaultLabel ? ` (follows ${defaultLabel})` : ' (standard)'}`}
                aria-expanded={isOpen}
                aria-controls={popoverId}
                className={`block h-6 w-9 flex-shrink-0 rounded-md ${isSet ? 'ring-2 ring-neutral-800' : 'border-[1.5px] border-dashed border-neutral-300'}`}
                style={{ background: value || 'transparent' }}
            />
            {isOpen && (
                <div
                    id={popoverId}
                    role="dialog"
                    aria-label={`Choose ${label}`}
                    className={`absolute right-0 z-40 w-[248px] rounded-xl border border-[#E5E0D6] bg-white p-3 shadow-xl ${opensUp ? 'bottom-full mb-2' : 'top-full mt-2'}`}
                >
                    <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">Your store&apos;s colours</div>
                    <div aria-label="Your store's colours" className="grid grid-cols-4 gap-1.5">
                        {storeColors.map((storeColor, index) => {
                            const isChosen = storeColor.color.toLowerCase() === value.toLowerCase()
                            return (
                                <button
                                    key={storeColor.label}
                                    ref={index === 0 ? firstSwatchRef : undefined}
                                    type="button"
                                    aria-pressed={isChosen}
                                    onClick={() => {
                                        if (!isChosen) onChange(storeColor.color)
                                        close()
                                    }}
                                    title={`${storeColor.label} · ${storeColor.color}`}
                                    className={`flex min-h-[44px] flex-col items-center gap-1 rounded-lg p-1 text-[10px] font-semibold hover:bg-[#F6F4F0] ${isChosen ? 'bg-[#F6F4F0] ring-2 ring-[#2A6FDB]' : ''}`}
                                >
                                    <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: storeColor.color }} />
                                    <span className="truncate">{storeColor.label}</span>
                                </button>
                            )
                        })}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <label className="relative h-8 w-8 flex-shrink-0 cursor-pointer overflow-hidden rounded-md border border-black/10" title="Pick any colour">
                            <input
                                type="color"
                                value={pickerHex}
                                onChange={(event) => onChange(event.target.value)}
                                aria-label={`Pick any colour for ${label}`}
                                className="absolute -inset-2 h-12 w-12 cursor-pointer border-none p-0"
                            />
                        </label>
                        <input
                            type="text"
                            value={hexDraft}
                            onChange={(event) => setHexDraft(event.target.value)}
                            onBlur={commitHex}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') commitHex()
                            }}
                            aria-label={`${label} hex code`}
                            placeholder="#000000"
                            className="min-w-0 flex-1 rounded-md border border-[#E5E0D6] px-2 py-1.5 font-mono text-[12px] outline-none focus:border-[#1D1815]"
                        />
                    </div>
                    {onUseDefault && isSet && (
                        <button
                            type="button"
                            onClick={() => {
                                onUseDefault()
                                close()
                            }}
                            className="mt-2.5 text-[12px] font-bold text-[#8B857B] underline hover:text-[#1D1815]"
                        >
                            {defaultLabel ? `Back to ${defaultLabel}` : 'Back to default'}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
