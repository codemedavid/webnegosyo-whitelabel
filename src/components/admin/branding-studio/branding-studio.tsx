'use client'

/**
 * Branding Studio — the tenant branding editor at /[tenant]/admin/branding.
 *
 * Replaces the old pencil-buttons + modal overlay on the storefront. Layout
 * follows the Branding Editor design spec: top bar (device toggle + Publish),
 * dark icon rail of surfaces, accordion settings panel with inherit-aware
 * fields, and a live pixel-exact preview of the real storefront (iframe
 * bridge — see preview-frame.tsx / use-branding-preview.ts).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BRANDING_SURFACES,
  BRANDING_PRESETS,
  getInheritSourceLabel,
  getSurfaceFieldIds,
  generatePaletteFromColor,
  isFieldSet,
  resolveFieldValue,
  buildPublishPayload,
  type BrandingSurface,
} from '@/lib/branding-registry'
import { saveBrandingAction, type BrandingInput } from '@/app/actions/branding'
import { FieldRow } from './field-row'
import { PreviewFrame } from './preview-frame'
import type { Tenant } from '@/types/database'

const PUBLISHED_TOAST_MS = 2500

interface BrandingStudioProps {
  tenant: Tenant
  tenantSlug: string
}

type Draft = Record<string, unknown>

export function BrandingStudio({ tenant, tenantSlug }: BrandingStudioProps) {
  const router = useRouter()
  const [surfaceId, setSurfaceId] = useState<BrandingSurface['id']>('storefront')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [draft, setDraft] = useState<Draft>({})
  // Locally-published values layered over the server tenant snapshot so the
  // editor stays accurate after Publish without waiting for a router refresh.
  const [publishedValues, setPublishedValues] = useState<Draft>({})
  const [isPublishing, setIsPublishing] = useState(false)
  const [showPublishedToast, setShowPublishedToast] = useState(false)

  const savedTenant = useMemo(
    () => ({ ...(tenant as unknown as Record<string, unknown>), ...publishedValues }),
    [tenant, publishedValues]
  )

  const surface = useMemo(
    () => BRANDING_SURFACES.find((s) => s.id === surfaceId) ?? BRANDING_SURFACES[0],
    [surfaceId]
  )
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 0: true })

  const isDirty = Object.keys(draft).length > 0

  // Guard against losing unsaved changes on tab close / hard navigation.
  useEffect(() => {
    if (!isDirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  const setFieldValue = useCallback((fieldId: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [fieldId]: value }))
  }, [])

  const clearFieldValue = useCallback((fieldId: string) => {
    // An explicit empty string clears the saved column on publish; if the
    // column was never saved, dropping the draft key keeps the diff minimal.
    setDraft((prev) => {
      const saved = (savedTenant as Draft)[fieldId]
      const next = { ...prev }
      if (saved !== undefined && saved !== null && saved !== '') next[fieldId] = ''
      else delete next[fieldId]
      return next
    })
  }, [savedTenant])

  const pickSurface = useCallback((id: BrandingSurface['id']) => {
    setSurfaceId(id)
    setOpenSections({ 0: true })
  }, [])

  const applyValues = useCallback((values: Record<string, string>) => {
    setDraft((prev) => ({ ...prev, ...values }))
  }, [])

  const resetSurface = useCallback(() => {
    const fieldIds = getSurfaceFieldIds(surface.id)
    setDraft((prev) => {
      const next = { ...prev }
      for (const id of fieldIds) {
        const saved = (savedTenant as Draft)[id]
        if (saved !== undefined && saved !== null && saved !== '') next[id] = ''
        else delete next[id]
      }
      return next
    })
  }, [surface.id, savedTenant])

  const handlePublish = useCallback(async () => {
    if (isPublishing) return
    setIsPublishing(true)
    try {
      const payload = buildPublishPayload(draft, savedTenant)
      const result = await saveBrandingAction(tenant.id, tenantSlug, payload as BrandingInput)
      if (!result.success) {
        toast.error(result.error || 'Failed to publish branding')
        return
      }
      if (result.warning) toast.warning(result.warning)
      setPublishedValues((prev) => ({ ...prev, ...draft }))
      setDraft({})
      setShowPublishedToast(true)
      window.setTimeout(() => setShowPublishedToast(false), PUBLISHED_TOAST_MS)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to publish branding')
    } finally {
      setIsPublishing(false)
    }
  }, [draft, savedTenant, tenant.id, tenantSlug, isPublishing, router])

  const surfaceHasOverrides = getSurfaceFieldIds(surface.id).some((id) =>
    isFieldSet(id, draft, savedTenant)
  )

  const [logoColor, setLogoColor] = useState('#E4572E')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#EFECE6] font-sans text-[#1D1815]">
      {/* ============ TOP BAR ============ */}
      <div className="z-20 flex h-[54px] flex-shrink-0 items-center gap-4 border-b border-[#E5E0D6] bg-white px-4">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/${tenantSlug}/admin`}
            className="flex h-[26px] items-center gap-1 rounded-lg px-2 text-[12px] font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Back to admin"
          >
            ← Admin
          </Link>
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[#1D1815] text-[13px] font-black text-white">
            W
          </div>
          <div className="text-[14px] font-extrabold">Branding Studio</div>
          <div className="border-l border-[#E5E0D6] pl-3 text-[12px] font-semibold text-[#8B857B]">
            {tenant.name}
          </div>
        </div>

        <div className="flex-1" />

        {/* device toggle */}
        <div className="flex gap-0.5 rounded-full bg-[#EFECE6] p-[3px]">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-bold capitalize transition-colors ${
                device === d ? 'bg-white text-[#1D1815] shadow-sm' : 'text-[#8B857B]'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {showPublishedToast && (
          <div className="text-[12px] font-bold text-emerald-700">✓ Published</div>
        )}
        <button
          type="button"
          onClick={handlePublish}
          disabled={isPublishing || !isDirty}
          className="rounded-full bg-[#1D1815] px-5 py-2 text-[13px] font-extrabold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {isPublishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ============ ICON RAIL ============ */}
        <nav className="flex w-[84px] flex-shrink-0 flex-col items-center gap-1 overflow-y-auto bg-[#1D1815] px-2 py-3">
          {BRANDING_SURFACES.map((s) => {
            const isActive = s.id === surface.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSurface(s.id)}
                className={`flex w-[68px] flex-col items-center gap-1.5 rounded-[10px] px-0.5 pb-2 pt-2 transition-colors hover:bg-white/15 ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/60'
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-[7px] text-[12px] font-black ${
                    isActive ? 'bg-amber-500 text-[#1D1815]' : 'bg-white/10 text-white/70'
                  }`}
                >
                  {s.glyph}
                </span>
                <span className="text-center text-[9.5px] font-bold leading-[1.15] tracking-wide">
                  {s.label}
                </span>
              </button>
            )
          })}
        </nav>

        {/* ============ SETTINGS PANEL ============ */}
        <aside className="flex w-[336px] flex-shrink-0 flex-col border-r border-[#E5E0D6] bg-white">
          <div className="border-b border-[#E5E0D6] px-[18px] pb-3 pt-4">
            <div className="flex items-baseline gap-2.5">
              <div className="text-[16px] font-extrabold">{surface.label}</div>
              <div className="flex-1" />
              {surfaceHasOverrides && (
                <button
                  type="button"
                  onClick={resetSurface}
                  className="text-[11.5px] font-bold text-[#8B857B] underline hover:text-[#1D1815]"
                >
                  Reset section
                </button>
              )}
            </div>
            <div className="mt-1 text-[12px] leading-snug text-[#8B857B]">{surface.description}</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Palette presets — global surface only */}
            {surface.id === 'global' && (
              <div className="border-b border-[#E5E0D6] px-[18px] pb-4 pt-3.5">
                <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">
                  Palette presets
                </div>
                <div className="flex flex-col gap-1.5">
                  {BRANDING_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyValues(preset.values)}
                      className="flex items-center gap-2.5 rounded-[10px] border border-[#E5E0D6] px-3 py-2 text-left text-[12.5px] font-bold transition-colors hover:border-[#1D1815]"
                    >
                      <span className="flex gap-[3px]">
                        {[preset.values.primary_color, preset.values.accent_color, preset.values.text_secondary_color, preset.values.background_color].map(
                          (swatch, i) => (
                            <span
                              key={i}
                              className="h-3.5 w-3.5 rounded border border-black/5"
                              style={{ background: swatch }}
                            />
                          )
                        )}
                      </span>
                      <span className="flex-1">{preset.name}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2.5 rounded-[10px] border border-dashed border-[#D8D2C6] px-3 py-2.5">
                  <label className="relative h-[30px] w-[30px] flex-shrink-0 cursor-pointer overflow-hidden rounded-full border border-neutral-200">
                    <input
                      type="color"
                      value={logoColor}
                      aria-label="Logo color"
                      onChange={(e) => {
                        setLogoColor(e.target.value)
                        applyValues(generatePaletteFromColor(e.target.value))
                      }}
                      className="absolute -inset-2 h-12 w-12 cursor-pointer border-none p-0"
                    />
                  </label>
                  <div className="flex-1">
                    <div className="text-[12.5px] font-bold">Generate from logo color</div>
                    <div className="mt-px text-[11px] text-[#8B857B]">
                      Pick your logo&apos;s main color — we derive a full palette.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Accordion sections */}
            {surface.sections.map((section, sectionIndex) => {
              const isOpen = !!openSections[sectionIndex]
              const isSectionDirty = section.fields.some(
                (f) => f.type !== 'note' && Object.prototype.hasOwnProperty.call(draft, f.id)
              )
              const visibleFields = section.fields.filter((f) => !f.mobileOnly || device === 'mobile')
              if (visibleFields.length === 0) return null
              return (
                <div key={section.title} className="border-b border-[#E5E0D6]">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSections((prev) => ({ ...prev, [sectionIndex]: !prev[sectionIndex] }))
                    }
                    className="flex w-full items-center gap-2 px-[18px] py-3 text-left text-[13px] font-extrabold hover:bg-black/[0.02]"
                  >
                    <span className="flex-1">{section.title}</span>
                    {isSectionDirty && <span className="h-1.5 w-1.5 rounded-full bg-[#E4572E]" />}
                    <span
                      className="text-[11px] text-neutral-400 transition-transform"
                      style={{ transform: `rotate(${isOpen ? 0 : -90}deg)` }}
                    >
                      ▼
                    </span>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-3 px-[18px] pb-4 pt-0.5">
                      {visibleFields.map((field) => (
                        <FieldRow
                          key={field.id}
                          field={field}
                          value={resolveFieldValue(field.id, draft, savedTenant)}
                          isSet={isFieldSet(field.id, draft, savedTenant)}
                          inheritLabel={getInheritSourceLabel(field.id, draft, savedTenant)}
                          onChange={(value) => setFieldValue(field.id, value)}
                          onClear={() => clearFieldValue(field.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="h-8" />
          </div>
        </aside>

        {/* ============ LIVE PREVIEW ============ */}
        <PreviewFrame tenantSlug={tenantSlug} surfaceId={surface.id} draft={draft} device={device} />
      </div>
    </div>
  )
}
