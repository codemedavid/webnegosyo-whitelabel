'use client'

/**
 * Tap-to-edit panels (brand editor v2, Phase 2):
 *  - ComponentPanel: what the owner tapped in the preview — a breadcrumb back
 *    up to the screen and ONLY that thing's settings.
 *  - SettingsSearch: "Find a setting" over every field on the screen.
 *  - EditModeToggle: Edit (tap to select) vs Try it (the preview behaves
 *    like the real store).
 */

import type { ReactNode } from 'react'
import type { BrandingField } from '@/lib/branding-registry'
import type { BrandingComponent, ComponentCrumb } from '@/lib/branding-components'

interface ComponentPanelProps {
    component: BrandingComponent
    crumbs: readonly ComponentCrumb[]
    fields: readonly BrandingField[]
    renderField: (field: BrandingField) => ReactNode
    onSelectScope: (scope: string | null) => void
}

export function ComponentPanel({ component, crumbs, fields, renderField, onSelectScope }: ComponentPanelProps) {
    return (
        <div>
            <nav aria-label="Selected element" className="flex flex-wrap items-center gap-1 border-b border-[#E5E0D6] px-[18px] py-3 text-[12px]">
                {crumbs.map((crumb, index) => {
                    const isLast = index === crumbs.length - 1
                    return (
                        <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                            {index > 0 && <span aria-hidden="true" className="text-neutral-300">›</span>}
                            {isLast ? (
                                <span className="font-extrabold text-[#1D1815]">{crumb.label}</span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onSelectScope(crumb.scope)}
                                    className="font-semibold text-[#8B857B] hover:text-[#1D1815] hover:underline"
                                >
                                    {crumb.label}
                                </button>
                            )}
                        </span>
                    )
                })}
            </nav>
            <div className="flex flex-col gap-3 px-[18px] pb-4 pt-3">
                {fields.length > 0 ? (
                    fields.map((field) => renderField(field))
                ) : (
                    <p className="text-[12px] text-[#8B857B]">This part follows your store&apos;s brand. Change it from the screen&apos;s settings.</p>
                )}
            </div>
            <div className="border-t border-[#E5E0D6] px-[18px] py-3">
                <button
                    type="button"
                    onClick={() => onSelectScope(component.parent)}
                    className="text-[12px] font-bold text-[#8B857B] underline hover:text-[#1D1815]"
                >
                    {component.parent ? `All ${component.sectionTitle} settings` : 'All settings on this screen'}
                </button>
            </div>
        </div>
    )
}

interface SettingsSearchProps {
    query: string
    onQueryChange: (query: string) => void
    inputRef?: React.Ref<HTMLInputElement>
}

export function SettingsSearch({ query, onQueryChange, inputRef }: SettingsSearchProps) {
    return (
        <div className="border-b border-[#E5E0D6] px-[18px] py-2.5">
            <label className="flex items-center gap-2 rounded-lg border border-[#E5E0D6] bg-[#F8F6F2] px-2.5 py-1.5 focus-within:border-[#1D1815]">
                <span aria-hidden="true" className="text-[12px] text-[#8B857B]">⌕</span>
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder="Find a setting (⌘K)"
                    aria-label="Find a setting"
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#A8A196]"
                />
            </label>
            <p className="mt-1.5 text-[11px] leading-snug text-[#8B857B]">Or tap anything in the preview to change it.</p>
        </div>
    )
}

/** True when a field's label or id matches the search words (all of them, any order). */
export function matchesSettingQuery(field: BrandingField, query: string): boolean {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return true
    const haystack = `${field.label} ${field.id.replace(/_/g, ' ')}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
}

interface EditModeToggleProps {
    isEditing: boolean
    onChange: (isEditing: boolean) => void
}

export function EditModeToggle({ isEditing, onChange }: EditModeToggleProps) {
    const option = (active: boolean) =>
        `rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${active ? 'bg-white text-[#1D1815] shadow-sm' : 'text-[#8B857B]'}`
    return (
        <div className="flex gap-0.5 rounded-full bg-[#EFECE6] p-[3px]" role="group" aria-label="Preview mode">
            <button type="button" onClick={() => onChange(true)} aria-pressed={isEditing} className={option(isEditing)} title="Tap anything in the preview to change it">
                Edit
            </button>
            <button type="button" onClick={() => onChange(false)} aria-pressed={!isEditing} className={option(!isEditing)} title="Use the preview like a customer">
                Try it
            </button>
        </div>
    )
}
