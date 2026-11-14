'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookmarkPlus, Check, Download } from 'lucide-react'
import type { FileCardSave } from '@/lib/assistant/types'
import { SHEET_IDS, type SheetId } from '@/lib/exports/catalogue'
import { exportHref } from '@/lib/exports/request-schema'

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; id: string | null } | { kind: 'error'; message: string }

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The file of a just-saved layout, for the dates Owl previewed. The card
 * comes back from stored history, so every part of the link is checked here;
 * the route checks them again.
 */
function savedFormatLinks(save: FileCardSave, id: string | null): { xlsx: string; csv: string } | null {
  if (save.kind !== 'format' || !id || !UUID.test(id)) return null
  const sheets = (Array.isArray(save.sheets) ? save.sheets : []).filter((sheet): sheet is SheetId => (SHEET_IDS as readonly string[]).includes(sheet))
  const { from, to } = save.period ?? {}
  if (sheets.length === 0 || typeof from !== 'string' || typeof to !== 'string' || !DAY_KEY.test(from) || !DAY_KEY.test(to)) return null
  const link = (format: 'xlsx' | 'csv') =>
    exportHref({ tenantId: save.tenantId, sheets, period: { preset: 'custom', from, to }, branch: null, format, source: 'owl', template: id })
  return { xlsx: link('xlsx'), csv: link('csv') }
}

/**
 * "Save to My formats" on a report's card: the OWNER's tap keeps the report's
 * shape (never its figures) so it can be made again for any dates from the
 * Export page. The route checks the whole thing again. A layout Owl matched
 * from an uploaded spreadsheet has no file until it is saved (its shape is
 * too long for a link): the tap saves it, then the file is offered here.
 */
export function SaveFormatButton({ save }: { save: FileCardSave }) {
  const isLayout = save.kind === 'format'
  const router = useRouter()
  const [state, setState] = useState<SaveState>({ kind: 'idle' })

  const keep = async () => {
    if (state.kind === 'saving' || state.kind === 'saved') return
    setState({ kind: 'saving' })
    try {
      const response = await fetch('/api/exports/formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isLayout ? 'save_format' : 'save', tenantId: save.tenantId, name: save.name, spec: save.spec }),
      })
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string; format?: { id?: unknown } } | null
      if (response.ok && body?.success) {
        setState({ kind: 'saved', id: typeof body.format?.id === 'string' ? body.format.id : null })
        // The Export page may be the one open behind the chat: let its My formats list pick this up.
        router.refresh()
      } else setState({ kind: 'error', message: body?.error ?? 'That could not be saved. Try again in a moment.' })
    } catch {
      setState({ kind: 'error', message: 'That could not be saved. Check your connection and try again.' })
    }
  }

  if (state.kind === 'saved') {
    const links = savedFormatLinks(save, state.id)
    return (
      <div className="flex flex-col gap-2">
        <p role="status" className="flex items-start gap-1.5 text-xs font-semibold leading-snug text-emerald-800">
          <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          Saved as “{save.name}”. Find it under My formats on the Export page.
        </p>
        {links && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={links.xlsx}
              download
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-bold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download Excel
            </a>
            <a
              href={links.csv}
              download
              className="inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-foreground/80 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              CSV
            </a>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void keep()}
        disabled={state.kind === 'saving'}
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-semibold text-foreground ring-1 ring-border outline-none transition-colors hover:ring-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
      >
        <BookmarkPlus className="h-4 w-4" aria-hidden />
        {state.kind === 'saving' ? 'Saving…' : isLayout ? 'Save this format' : 'Save to My formats'}
      </button>
      {state.kind === 'error' && (
        <p role="alert" className="text-xs leading-snug text-red-700">
          {state.message}
        </p>
      )}
    </div>
  )
}
