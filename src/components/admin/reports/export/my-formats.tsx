'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Eye, FileSpreadsheet, Lock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dayCountInclusive } from '@/lib/exports/export-page-model'
import { templateRangeProblem, type TemplateCard } from '@/lib/exports/report-templates'
import { exportHref, type ExportRequest } from '@/lib/exports/request-schema'
import type { ExportPreview } from '@/lib/exports/run-export'
import { CoverageNote } from '../coverage-note'
import { ExportPreviewPanel } from './export-preview'

export interface MyFormatsProps {
  tenantId: string
  formats: TemplateCard[]
  period: ExportRequest['period']
  periodFrom: string
  periodTo: string
  branch: string | null
  /** The dates the page fell back from, if any: nothing is made until they are fixed. */
  periodError: string | null
}

type PreviewState =
  | { kind: 'closed' }
  | { kind: 'loading'; id: string }
  | { kind: 'ready'; id: string; preview: ExportPreview }
  | { kind: 'error'; id: string; message: string }

/** After a file is asked for, the list of recent exports is read again. */
const REFRESH_AFTER_DOWNLOAD_MS = 4000

/**
 * "My formats": reports the store saved from Owl's cards (a custom report, or
 * the owner's own layout), each made again for the dates picked above. The
 * link names the format by id; the server reads its shape. A format is a shape, not figures:
 * the file is read now, as this person, by the same engine as every export.
 */
export function MyFormats({ tenantId, formats, period, periodFrom, periodTo, branch, periodError }: MyFormatsProps) {
  const router = useRouter()
  const [preview, setPreview] = useState<PreviewState>({ kind: 'closed' })
  const [armed, setArmed] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<{ id: string; message: string } | null>(null)
  const periodKey = `${period.preset}:${period.from ?? ''}:${period.to ?? ''}:${branch ?? ''}`
  const days = dayCountInclusive(periodFrom, periodTo)

  // A preview belongs to its dates: new dates, closed preview.
  useEffect(() => setPreview({ kind: 'closed' }), [periodKey])

  if (formats.length === 0) return null

  const check = async (card: TemplateCard) => {
    if (preview.kind !== 'closed' && preview.id === card.id) {
      setPreview({ kind: 'closed' })
      return
    }
    setPreview({ kind: 'loading', id: card.id })
    try {
      const response = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, mode: 'preview', sheets: card.sheets, period, branch, template: card.id }),
      })
      const body = (await response.json().catch(() => null)) as { success?: boolean; preview?: ExportPreview; error?: string } | null
      if (response.ok && body?.success && body.preview) setPreview({ kind: 'ready', id: card.id, preview: body.preview })
      else setPreview({ kind: 'error', id: card.id, message: body?.error ?? 'The preview could not be read. Try again in a moment.' })
    } catch {
      setPreview({ kind: 'error', id: card.id, message: 'The preview could not be read. Check your connection and try again.' })
    }
  }

  const remove = async (card: TemplateCard) => {
    setRemoving(card.id)
    setRemoveError(null)
    try {
      const response = await fetch('/api/exports/formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', tenantId, id: card.id }),
      })
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null
      if (response.ok && body?.success) {
        setArmed(null)
        router.refresh()
      } else {
        setRemoveError({ id: card.id, message: body?.error ?? 'That could not be removed. Try again in a moment.' })
      }
    } catch {
      setRemoveError({ id: card.id, message: 'That could not be removed. Check your connection and try again.' })
    } finally {
      setRemoving(null)
    }
  }

  const afterDownload = () => void setTimeout(() => router.refresh(), REFRESH_AFTER_DOWNLOAD_MS)

  return (
    <section aria-labelledby="my-formats" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h2 id="my-formats" className="text-[17px] font-extrabold tracking-[-0.01em] text-wn-ink">
          My formats
        </h2>
        <p className="text-[13px] text-muted-foreground">Reports you saved. Each is made for the dates above.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {formats.map((card) => {
          const problem = card.lockedNote ?? periodError ?? templateRangeProblem(days, card)
          const href = (format: 'xlsx' | 'csv') =>
            exportHref({ tenantId, sheets: card.sheets, period, branch, format, source: 'page', template: card.id })
          const isOpen = preview.kind !== 'closed' && preview.id === card.id
          const isArmed = armed === card.id
          return (
            <li key={card.id} className="rounded-xl bg-white ring-1 ring-border">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-[14.5px] font-bold leading-tight text-wn-ink">{card.name}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{card.summary}</p>
                  {card.savedBy && <p className="text-[12.5px] text-muted-foreground">Saved by {card.savedBy}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {problem === null ? (
                    <>
                      <Button asChild className="h-11 font-bold">
                        <a href={href('xlsx')} download onClick={afterDownload}>
                          <FileSpreadsheet aria-hidden />
                          Excel
                        </a>
                      </Button>
                      <Button asChild variant="outline" className="h-11 bg-white font-semibold">
                        <a href={href('csv')} download onClick={afterDownload}>
                          <Download aria-hidden />
                          CSV
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 bg-white font-semibold"
                        aria-expanded={isOpen}
                        aria-controls={`format-${card.id}-preview`}
                        onClick={() => void check(card)}
                      >
                        <Eye aria-hidden />
                        {isOpen ? 'Hide' : 'Preview'}
                      </Button>
                    </>
                  ) : card.lockedNote ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
                      <Lock className="size-3.5" aria-hidden />
                      Locked
                    </span>
                  ) : null}
                  {isArmed ? (
                    <>
                      <Button type="button" variant="destructive" className="h-11 font-bold" disabled={removing === card.id} onClick={() => void remove(card)}>
                        {removing === card.id ? 'Removing…' : 'Yes, remove'}
                      </Button>
                      <Button type="button" variant="outline" className="h-11 bg-white font-semibold" disabled={removing === card.id} onClick={() => setArmed(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 font-semibold text-muted-foreground hover:text-wn-ink"
                      aria-label={`Remove ${card.name}`}
                      onClick={() => {
                        setArmed(card.id)
                        setRemoveError(null)
                      }}
                    >
                      <Trash2 aria-hidden />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              {problem !== null && (
                <div className="px-4 pb-3">
                  <CoverageNote tone="warning">{problem}</CoverageNote>
                </div>
              )}
              {isArmed && (
                <p className="px-4 pb-3 text-[13px] text-muted-foreground">
                  This removes the saved format for everyone in the store. Files already downloaded are not touched.
                </p>
              )}
              {removeError?.id === card.id && (
                <div className="px-4 pb-3">
                  <CoverageNote tone="warning">{removeError.message}</CoverageNote>
                </div>
              )}
              {isOpen && (
                <div id={`format-${card.id}-preview`} className="border-t border-border bg-wn-sand/40 px-4 py-3">
                  {preview.kind === 'loading' && (
                    <p role="status" className="py-3 text-center text-[14px] text-muted-foreground">
                      Reading your figures…
                    </p>
                  )}
                  {preview.kind === 'error' && <CoverageNote tone="warning">{preview.message}</CoverageNote>}
                  {preview.kind === 'ready' && <ExportPreviewPanel preview={preview.preview} />}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
