'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Download, FileSpreadsheet, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SheetId } from '@/lib/exports/catalogue'
import {
  EXPORT_PACKS,
  dayCountInclusive,
  initialSheets,
  packSheets,
  rangeProblem,
  type ExportCard,
  type ExportCardGroup,
} from '@/lib/exports/export-page-model'
import { exportHref, type ExportRequest } from '@/lib/exports/request-schema'
import type { ExportPreview } from '@/lib/exports/run-export'
import { CoverageNote } from '../coverage-note'
import { ExportPreviewPanel } from './export-preview'

export interface ExportBuilderProps {
  tenantId: string
  groups: ExportCardGroup[]
  /** What the link asked for (`?sheets=`), already narrowed to known ids. */
  askedSheets: SheetId[]
  period: ExportRequest['period']
  periodFrom: string
  periodTo: string
  branch: string | null
  /** The dates the page fell back from, if any: nothing is exported until they are fixed. */
  periodError: string | null
}

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; preview: ExportPreview }
  | { kind: 'error'; message: string }

const PREVIEW_DELAY_MS = 350
/** After a file is asked for, the list of recent exports is read again. */
const REFRESH_AFTER_DOWNLOAD_MS = 4000

interface SheetCardProps {
  card: ExportCard
  isPicked: boolean
  onToggle: () => void
}

function SheetCard({ card, isPicked, onToggle }: SheetCardProps) {
  const isLocked = card.lockedNote !== null
  return (
    <li>
      <label
        className={cn(
          'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-white px-3.5 py-3 ring-1 ring-border transition-shadow',
          'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60',
          isPicked && 'ring-2 ring-wn-ink',
          isLocked && 'cursor-not-allowed opacity-60',
        )}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={isPicked}
          disabled={isLocked}
          onChange={onToggle}
          aria-describedby={`sheet-${card.id}-about`}
        />
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-border',
            isPicked ? 'bg-wn-ink text-white ring-wn-ink' : 'bg-white',
          )}
        >
          {isLocked ? <Lock className="size-3 text-muted-foreground" /> : isPicked ? <Check className="size-3.5" /> : null}
        </span>
        <span className="min-w-0">
          <span className="block text-[14.5px] font-bold leading-tight text-wn-ink">{card.name}</span>
          <span id={`sheet-${card.id}-about`} className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
            {card.lockedNote ?? `One row is ${card.rowIs}.`}
          </span>
        </span>
      </label>
    </li>
  )
}

function StepHeading({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-wn-ink text-[12.5px] font-extrabold text-white tabular-nums">
        {step}
      </span>
      <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-wn-ink">{title}</h2>
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Steps 2 and 3 of the Export page: tick the sheets, see exactly what the
 * file will hold, download it. (Step 1, the dates, is the filter bar above.)
 * The preview and the file are built by the same server code, as this person.
 */
export function ExportBuilder({ tenantId, groups, askedSheets, period, periodFrom, periodTo, branch, periodError }: ExportBuilderProps) {
  const router = useRouter()
  const [picked, setPicked] = useState<SheetId[]>(() => initialSheets(askedSheets, groups))
  const [state, setState] = useState<PreviewState>({ kind: 'idle' })
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cards = useMemo(() => groups.flatMap((group) => group.cards), [groups])
  const pickedCards = useMemo(() => cards.filter((card) => picked.includes(card.id)), [cards, picked])
  const problem = periodError ?? rangeProblem(dayCountInclusive(periodFrom, periodTo), pickedCards)
  // Catalogue order, whatever order they were ticked in: the file's tabs follow it.
  const sheets = useMemo(() => cards.filter((card) => picked.includes(card.id)).map((card) => card.id), [cards, picked])
  const sheetsKey = sheets.join(',')
  const periodKey = `${period.preset}:${period.from ?? ''}:${period.to ?? ''}:${branch ?? ''}`

  useEffect(() => {
    if (sheetsKey === '' || problem) {
      setState({ kind: 'idle' })
      return
    }
    const controller = new AbortController()
    setState({ kind: 'loading' })
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/exports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, mode: 'preview', sheets: sheetsKey.split(','), period, branch }),
          signal: controller.signal,
        })
        const body = (await response.json().catch(() => null)) as { success?: boolean; preview?: ExportPreview; error?: string } | null
        if (controller.signal.aborted) return
        if (response.ok && body?.success && body.preview) setState({ kind: 'ready', preview: body.preview })
        else setState({ kind: 'error', message: body?.error ?? 'The preview could not be read. Try again in a moment.' })
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error', message: 'The preview could not be read. Check your connection and try again.' })
      }
    }, PREVIEW_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `period` is rebuilt by the server on every navigation; its key says whether it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, sheetsKey, periodKey, problem])

  useEffect(() => () => void (refreshTimer.current && clearTimeout(refreshTimer.current)), [])

  const toggle = (id: SheetId) => setPicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]))
  const afterDownload = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), REFRESH_AFTER_DOWNLOAD_MS)
  }

  const canDownload = state.kind === 'ready'
  const href = (format: 'xlsx' | 'csv') => exportHref({ tenantId, sheets, period, branch, format, source: 'page' })

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="export-step-sheets" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div id="export-step-sheets">
            <StepHeading step={2} title="What goes in the file" hint="Each one becomes a tab." />
          </div>
          {picked.length > 0 && (
            <Button type="button" variant="outline" className="h-11 bg-white font-semibold" onClick={() => setPicked([])}>
              Clear all
            </Button>
          )}
        </div>
        <div role="group" aria-label="Ready-made sets" className="flex flex-wrap gap-2">
          {EXPORT_PACKS.map((pack) => {
            const sheetsOfPack = packSheets(pack, groups)
            if (sheetsOfPack.length === 0) return null
            const isOn = sheetsOfPack.length === picked.length && sheetsOfPack.every((id) => picked.includes(id))
            return (
              <button
                key={pack.id}
                type="button"
                title={pack.about}
                aria-pressed={isOn}
                onClick={() => setPicked(sheetsOfPack)}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-4 text-[13.5px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                  isOn ? 'bg-wn-ink text-white' : 'bg-white text-wn-ink ring-1 ring-border hover:ring-wn-ink',
                )}
              >
                {pack.label}
              </button>
            )
          })}
        </div>
        {groups.map((group) => (
          <fieldset key={group.id} className="flex flex-col gap-2">
            <legend className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</legend>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.cards.map((card) => (
                <SheetCard key={card.id} card={card} isPicked={picked.includes(card.id)} onToggle={() => toggle(card.id)} />
              ))}
            </ul>
          </fieldset>
        ))}
      </section>

      <section aria-labelledby="export-step-check" className="flex flex-col gap-3">
        <div id="export-step-check">
          <StepHeading step={3} title="Check it, then download" />
        </div>
        {problem && <CoverageNote tone="warning">{problem}</CoverageNote>}
        {!problem && sheets.length === 0 && (
          <p className="rounded-xl bg-white px-4 py-6 text-center text-[14px] text-muted-foreground ring-1 ring-border">
            Tick at least one sheet above to see what the file will hold.
          </p>
        )}
        {state.kind === 'error' && <CoverageNote tone="warning">{state.message}</CoverageNote>}
        {state.kind === 'loading' && (
          <p role="status" className="rounded-xl bg-white px-4 py-6 text-center text-[14px] text-muted-foreground ring-1 ring-border">
            Reading your figures…
          </p>
        )}
        {state.kind === 'ready' && <ExportPreviewPanel preview={state.preview} />}

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
          <p className="min-w-0 basis-full text-[13px] font-medium text-muted-foreground sm:flex-1 sm:basis-0 sm:text-[13.5px]">
            {canDownload
              ? `${sheets.length} ${sheets.length === 1 ? 'sheet' : 'sheets'} · ${state.preview.header.periodLabel} · ${state.preview.header.branchLabel}`
              : 'Nothing to download yet.'}
          </p>
          {canDownload ? (
            <>
              <Button asChild className="h-11 flex-1 font-bold sm:flex-none">
                <a href={href('xlsx')} download onClick={afterDownload}>
                  <FileSpreadsheet aria-hidden />
                  Download Excel
                </a>
              </Button>
              <Button asChild variant="outline" className="h-11 bg-white font-semibold">
                <a href={href('csv')} download onClick={afterDownload}>
                  <Download aria-hidden />
                  CSV
                </a>
              </Button>
            </>
          ) : (
            <Button type="button" disabled className="h-11 font-bold">
              <FileSpreadsheet aria-hidden />
              Download Excel
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
