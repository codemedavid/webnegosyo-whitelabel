import { Download, FileSpreadsheet } from 'lucide-react'
import type { FileCard } from '@/lib/assistant/types'
import { SaveFormatButton } from './save-format-button'

const COUNT = new Intl.NumberFormat('en-PH')

/** Only our own export route, on this site: a card can never send the owner elsewhere. */
export function isExportHref(href: unknown): href is string {
  return typeof href === 'string' && href.startsWith('/api/exports?') && !href.includes('//') && !href.includes('\\')
}

/** A card comes back from stored history: offer Save only when its parts are there (the route checks them properly). */
function canSave(save: FileCard['save']): save is NonNullable<FileCard['save']> {
  return !!save && typeof save.tenantId === 'string' && typeof save.name === 'string' && typeof save.spec === 'object' && save.spec !== null
}

function rowsText(rows: number | null): string {
  if (rows === null) return 'counted in the file'
  return `${COUNT.format(rows)} ${rows === 1 ? 'row' : 'rows'}`
}

/**
 * A file Owl prepared. The buttons are plain links to `/api/exports`: the
 * file is built when one is tapped, as the person tapping, and logged there.
 */
export function FileCardView({ card }: { card: FileCard }) {
  const downloads = (Array.isArray(card.downloads) ? card.downloads : []).filter((download) => isExportHref(download.href))
  if (downloads.length === 0) return null
  const [main, ...others] = downloads
  return (
    <section className="rounded-2xl bg-white ring-1 ring-border">
      <header className="flex items-start gap-2.5 px-4 pb-2 pt-3">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-[13px] font-extrabold tracking-[-0.01em]">{card.title}</h3>
          <p className="text-xs text-muted-foreground">{card.subtitle}</p>
        </div>
      </header>
      <ul className="divide-y divide-border px-4">
        {card.sheets.map((sheet) => (
          <li key={sheet.name} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
            <span className="min-w-0 truncate font-medium">{sheet.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{rowsText(sheet.rows)}</span>
          </li>
        ))}
      </ul>
      {card.notes.length > 0 && (
        <ul className="px-4 pt-2 text-xs leading-snug text-muted-foreground">
          {card.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-3">
        <a
          href={main.href}
          download
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-bold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Download className="h-4 w-4" aria-hidden />
          {main.label}
        </a>
        {others.map((download) => (
          <a
            key={download.href}
            href={download.href}
            download
            className="inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-foreground/80 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {download.label}
          </a>
        ))}
      </div>
      {canSave(card.save) && (
        <div className="border-t border-border px-4 py-3">
          <SaveFormatButton save={card.save} />
        </div>
      )}
    </section>
  )
}
