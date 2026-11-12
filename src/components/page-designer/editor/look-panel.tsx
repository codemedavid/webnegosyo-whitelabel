'use client'

/**
 * The Page Designer's "Look" tab: the Branding Studio settings this page
 * paints from (colours, the order page and loyalty card look, the store's
 * wording), with the Studio's own rows, inherit chain and contrast checks.
 * Edits preview on the canvas at once and are saved with Publish (or with
 * "Save look now", which leaves the design as it is).
 */

import { Loader2, RotateCcw, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getInheritSourceLabel, isFieldSet, isFieldVisible, resolveFieldValue, type BrandingField } from '@/lib/branding-registry'
import { getTenantBranding } from '@/lib/branding-utils'
import { listTenantContrastIssues } from '@/lib/branding-studio/tenant-contrast'
import { lookValues, MOBILE_PREFIX, PAGE_LOOK_SECTIONS, previewLookRow, type LookChanges } from '@/lib/page-designer/look'
import type { PageId } from '@/lib/page-designer/types'
import { toTrackingHex } from '@/lib/tracking-style/keys'
import { isHexOnlyField } from '@/lib/branding-studio/studio-columns'
import { cn } from '@/lib/utils'
import { FieldRow } from '@/components/admin/branding-studio/field-row'
import type { StoreColor } from '@/components/admin/branding-studio/color-picker'
import { PaymentStepPreviewButton } from './payment-step-preview'

/** The Look section that carries the "Preview the payment step" button. */
const FIRST_PAYMENT_SECTION = 'Payment step · How it opens'

interface LookPanelProps {
  page: PageId
  /** The saved store row (what the storefront shows now). */
  saved: Readonly<Record<string, unknown>>
  changes: LookChanges
  onChange: (fieldId: string, value: string | boolean) => void
  onClear: (fieldId: string) => void
  onDiscard: () => void
  onSave: () => void
  isSaving: boolean
}

const SHARED_NOTE: Record<PageId, string> = {
  checkout: 'These are your store’s checkout colours: they also show on your standard checkout and in Branding Studio.',
  confirmation: 'The thank-you page uses your checkout colours: changing them here changes your checkout too.',
  tracking: 'Your order page look: it also shows on the standard order page and in Branding Studio.',
}

function useStoreColors(saved: Readonly<Record<string, unknown>>) {
  return useMemo(() => {
    const brand = getTenantBranding(saved as Record<string, unknown>)
    const colors = [
      { label: 'Brand', color: brand.accent },
      { label: 'Main', color: brand.primary },
      { label: 'Button', color: brand.buttonPrimary },
      { label: 'Page', color: brand.background },
      { label: 'Cards', color: brand.cards },
      { label: 'Text', color: brand.textPrimary },
      { label: 'Soft text', color: brand.textSecondary },
      { label: 'Lines', color: brand.border },
    ].filter((entry): entry is StoreColor => typeof entry.color === 'string' && entry.color.length > 0)
    // The order page / loyalty card take hex only.
    const hex = colors.flatMap((entry) => {
      const color = toTrackingHex(entry.color)
      return color ? [{ ...entry, color }] : []
    })
    return { colors, hex }
  }, [saved])
}

function Section({ title, isOpen, onToggle, children }: { title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="border-b border-neutral-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 hover:text-neutral-900"
      >
        {title}
        <span aria-hidden="true" className={cn('text-neutral-400 transition-transform', isOpen ? 'rotate-90' : '')}>›</span>
      </button>
      {isOpen && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  )
}

export function LookPanel({ page, saved, changes, onChange, onClear, onDiscard, onSave, isSaving }: LookPanelProps) {
  const sections = PAGE_LOOK_SECTIONS[page]
  const savedValues = useMemo(() => lookValues(saved), [saved])
  const draft = changes as Record<string, unknown>
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([sections[0]?.title]))
  const storeColors = useStoreColors(saved)
  const contrastIssues = useMemo(() => listTenantContrastIssues(draft, savedValues), [draft, savedValues])
  const changedCount = Object.keys(changes).length
  // The store row with these edits, for the payment step preview.
  const previewRow = useMemo(() => previewLookRow(saved, changes), [saved, changes])
  const valueOf = (fieldId: string) => resolveFieldValue(fieldId, draft, savedValues)

  const toggle = (title: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })

  const phoneOverride = (field: BrandingField): string | null => {
    const id = `${MOBILE_PREFIX}${field.id}`
    if (id in changes) return null
    const value = savedValues[id]
    return typeof value === 'string' && value.trim() ? value : null
  }

  const row = (field: BrandingField) =>
    isFieldVisible(field, valueOf) ? (
      <div key={field.id}>
      <FieldRow
        field={field}
        value={valueOf(field.id)}
        isSet={isFieldSet(field.id, draft, savedValues)}
        inheritLabel={getInheritSourceLabel(field.id, draft, savedValues)}
        onChange={(value) => onChange(field.id, value as string | boolean)}
        onClear={() => onClear(field.id)}
        contrastIssue={contrastIssues.find((issue) => issue.fieldId === field.id) ?? null}
        storeColors={isHexOnlyField(field.id) ? storeColors.hex : storeColors.colors}
      />
      {phoneOverride(field) && (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md bg-violet-50 px-2 py-1.5 text-[11px] leading-snug text-violet-900">
          <Smartphone className="h-3 w-3 shrink-0" />
          <span className="flex-1">
            Phones use their own colour from Branding Studio
            <span className="ml-1 inline-block h-2.5 w-2.5 rounded-sm align-middle ring-1 ring-black/10" style={{ background: phoneOverride(field) ?? undefined }} />.
          </span>
          <button type="button" onClick={() => onChange(`${MOBILE_PREFIX}${field.id}`, '')} className="font-semibold underline-offset-2 hover:underline">
            Use this on phones too
          </button>
        </p>
      )}
      </div>
    ) : null

  return (
    <div>
      <p className="mx-4 my-3 rounded-lg bg-sky-50 p-2.5 text-[11px] leading-snug text-sky-900">{SHARED_NOTE[page]} Blank settings follow your brand.</p>
      {changedCount > 0 && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          <span className="flex-1 font-semibold">
            {changedCount} look {changedCount === 1 ? 'change' : 'changes'} — saved when you publish
          </span>
          <button type="button" onClick={onDiscard} className="rounded p-1 hover:bg-amber-100" title="Undo look changes" aria-label="Undo look changes">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-2 py-1 font-bold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {isSaving && <Loader2 className="h-3 w-3 animate-spin" />} Save look now
          </button>
        </div>
      )}
      {sections.map((section) => (
        <Section key={section.title} title={section.title} isOpen={open.has(section.title)} onToggle={() => toggle(section.title)}>
          {section.title === FIRST_PAYMENT_SECTION && <PaymentStepPreviewButton row={previewRow} />}
          {section.fields.map(row)}
        </Section>
      ))}
    </div>
  )
}
