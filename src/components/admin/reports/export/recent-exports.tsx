import { EXPORT_SHEETS, SHEET_IDS, type SheetId } from '@/lib/exports/catalogue'
import { againHref } from '@/lib/exports/again-href'
import { listRecentExports, type ExportLogEntry } from '@/lib/exports/server/export-log'
import { manilaDateTime } from '@/lib/exports/cells'

const KNOWN = new Set<string>(SHEET_IDS)
const SOURCE_LABELS: Readonly<Record<string, string>> = { page: 'Export page', button: 'A report', owl: 'Owl' }

function sheetNames(entry: ExportLogEntry): string {
  // A saved format logs its tabs as `<sheet>:<n>`: name each catalogue sheet once.
  const names = [...new Set(entry.sheets.map((id) => id.split(':')[0]))].map((id) => (KNOWN.has(id) ? EXPORT_SHEETS[id as SheetId].name : id))
  const shape = entry.shape
  const shaped =
    shape.kind === 'custom' ? `${shape.spec ? `${shape.spec.title} · ` : ''}Custom report from ` : shape.kind === 'template' ? 'Saved format from ' : ''
  return `${shaped}${names.join(', ')}`
}

function range(entry: ExportLogEntry): string {
  return entry.periodFrom === entry.periodTo ? entry.periodFrom : `${entry.periodFrom} to ${entry.periodTo}`
}


/**
 * The export log this person may read (their own; the whole store's for the
 * owner and store-wide Store Activity readers; a branch account's Store Activity
 * adds its own branch). A failed read hides the list, never the page.
 */
export async function RecentExports({ tenantId }: { tenantId: string }) {
  let entries: ExportLogEntry[]
  try {
    entries = await listRecentExports(tenantId, 10)
  } catch (error) {
    console.error('[exports] recent exports failed', error instanceof Error ? error.message : error)
    return null
  }
  if (entries.length === 0) return null
  return (
    <section aria-labelledby="recent-exports" className="flex flex-col gap-2">
      <h2 id="recent-exports" className="text-[17px] font-extrabold tracking-[-0.01em] text-wn-ink">
        Recent exports
      </h2>
      <p className="text-[13px] text-muted-foreground">
        Files are not kept. “Download again” reads the same dates now, so an order changed since then shows as it is today.
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-white ring-1 ring-border">
        {entries.map((entry) => {
          const href = againHref(tenantId, entry)
          return (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-wn-ink">
                  {range(entry)} · {entry.format === 'csv' ? 'CSV' : 'Excel'}
                </p>
                <p className="text-[13px] leading-snug text-muted-foreground">{sheetNames(entry)}</p>
                <p className="text-[12.5px] text-muted-foreground tabular-nums">
                  {manilaDateTime(Date.parse(entry.createdAt))}
                  {entry.userLabel ? ` · ${entry.userLabel}` : ''} · {SOURCE_LABELS[entry.source] ?? entry.source}
                </p>
              </div>
              {href && (
                <a
                  href={href}
                  download
                  className="inline-flex min-h-11 items-center rounded-md text-[13.5px] font-bold text-wn-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Download again
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
