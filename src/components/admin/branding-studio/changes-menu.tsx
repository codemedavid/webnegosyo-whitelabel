'use client'

/**
 * The Studio's safety net in the top bar: undo / redo, and "N changes ▾" —
 * every unpublished change with its before → after, a per-change undo, and
 * Discard all.
 */

import { useEffect, useRef, useState } from 'react'
import type { ChangeStore, StudioChange } from '@/lib/branding-studio/studio-drafts'

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const MAX_VALUE_CHARS = 24

function ValuePreview({ value }: { value: unknown }) {
    if (value === undefined || value === null || value === '') {
        return <span className="text-neutral-400">default</span>
    }
    if (typeof value === 'string' && HEX_COLOR.test(value)) {
        return <span aria-label={value} title={value} className="inline-block h-3.5 w-3.5 rounded border border-black/10 align-middle" style={{ background: value }} />
    }
    if (typeof value === 'boolean') return <span>{value ? 'On' : 'Off'}</span>
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return <span className="font-mono">{text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text}</span>
}

interface HistoryButtonsProps {
    canUndo: boolean
    canRedo: boolean
    onUndo: () => void
    onRedo: () => void
}

export function HistoryButtons({ canUndo, canRedo, onUndo, onRedo }: HistoryButtonsProps) {
    const buttonClass = 'flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-bold text-[#1D1815] hover:bg-[#EFECE6] disabled:opacity-30 disabled:hover:bg-transparent'
    return (
        <div className="flex items-center gap-0.5">
            <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)" className={buttonClass}>↶</button>
            <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)" className={buttonClass}>↷</button>
        </div>
    )
}

interface ChangesMenuProps {
    changes: readonly StudioChange[]
    onRevert: (store: ChangeStore, fieldId: string) => void
    onDiscardAll: () => void
}

export function ChangesMenu({ changes, onRevert, onDiscardAll }: ChangesMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isOpen) return
        const close = (event: MouseEvent | KeyboardEvent) => {
            if (event instanceof KeyboardEvent) {
                if (event.key !== 'Escape') return
                // The Studio's own Esc (step out of a selection) must not also fire.
                event.preventDefault()
                setIsOpen(false)
                return
            }
            if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false)
        }
        window.addEventListener('mousedown', close)
        window.addEventListener('keydown', close, true)
        return () => {
            window.removeEventListener('mousedown', close)
            window.removeEventListener('keydown', close, true)
        }
    }, [isOpen])

    if (changes.length === 0) {
        return <div className="text-[12px] font-semibold text-[#8B857B]">No changes</div>
    }

    const countLabel = `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`
    return (
        <div ref={menuRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                className="rounded-full px-3 py-1.5 text-[12px] font-bold text-[#1D1815] hover:bg-[#EFECE6]"
            >
                {countLabel} ▾
            </button>
            {isOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-[320px] rounded-xl border border-[#E5E0D6] bg-white p-2 shadow-xl">
                    <div className="px-2 pb-2 pt-1 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">
                        Not published yet
                    </div>
                    <ul className="max-h-[320px] overflow-y-auto">
                        {changes.map((change) => (
                            <li key={`${change.store}:${change.fieldId}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-[#F6F4F0]">
                                <span className="min-w-0 flex-1 truncate font-semibold">{change.label}</span>
                                {change.store !== 'categories' && (
                                    <span className="flex items-center gap-1 text-[11px]">
                                        <ValuePreview value={change.before} />
                                        <span className="text-neutral-400">→</span>
                                        <ValuePreview value={change.after} />
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onRevert(change.store, change.fieldId)}
                                    aria-label={`Undo change to ${change.label}`}
                                    title="Undo this change"
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] text-[#8B857B] hover:bg-[#EFECE6] hover:text-[#1D1815]"
                                >
                                    ↺
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-1 border-t border-[#E5E0D6] px-2 pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                onDiscardAll()
                                setIsOpen(false)
                            }}
                            className="text-[12px] font-bold text-[#B42318] hover:underline"
                        >
                            Discard all changes
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

interface RestoreBannerProps {
    savedAt: number
    onRestore: () => void
    onDismiss: () => void
}

export function RestoreBanner({ savedAt, onRestore, onDismiss }: RestoreBannerProps) {
    const when = new Date(savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    return (
        <div role="status" className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-950">
            <span className="flex-1">You have unpublished changes from {when}.</span>
            <button type="button" onClick={onRestore} className="rounded-full bg-amber-900 px-3 py-1 text-[12px] font-bold text-white hover:bg-amber-800">
                Bring them back
            </button>
            <button type="button" onClick={onDismiss} className="text-[12px] font-bold text-amber-900 hover:underline">
                Start fresh
            </button>
        </div>
    )
}
