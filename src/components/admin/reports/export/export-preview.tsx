import { formatPreviewCell } from '@/lib/exports/export-page-model'
import type { ExportPreview, PreviewSheet } from '@/lib/exports/run-export'
import { cn } from '@/lib/utils'
import { CoverageNote } from '../coverage-note'

const COUNT = new Intl.NumberFormat('en-PH')

function rowsText(sheet: PreviewSheet): string {
  if (sheet.rows === null) return 'Rows are counted when the file is made'
  if (sheet.rows === 0) return 'No rows for these dates'
  return `${COUNT.format(sheet.rows)} ${sheet.rows === 1 ? 'row' : 'rows'}`
}

function SheetPreview({ sheet }: { sheet: PreviewSheet }) {
  const isNumeric = (index: number) => sheet.kinds[index] !== 'text'
  return (
    <article aria-label={sheet.name} className="overflow-hidden rounded-xl bg-white ring-1 ring-border">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 pt-3.5">
        <h3 className="text-[15px] font-extrabold text-wn-ink">{sheet.name}</h3>
        <p className="text-[13px] font-semibold text-wn-ink tabular-nums">{rowsText(sheet)}</p>
      </header>
      <p className="px-4 pt-0.5 text-[13px] text-muted-foreground">
        One row is {sheet.rowIs}. {sheet.columns.length} columns.
      </p>
      {sheet.notes.length > 0 && (
        <ul className="px-4 pt-1.5 text-[12.5px] leading-snug text-muted-foreground">
          {sheet.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 overflow-x-auto border-t border-border" tabIndex={0} role="region" aria-label={`First rows of ${sheet.name}`}>
        <table className="w-max min-w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-wn-sand">
              {sheet.columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn('whitespace-nowrap px-3 py-2 font-bold text-wn-ink', isNumeric(index) ? 'text-right' : 'text-left')}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.peek.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border">
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={cn(
                      'max-w-64 truncate whitespace-nowrap px-3 py-1.5 text-wn-ink',
                      isNumeric(index) && typeof cell !== 'string' ? 'text-right tabular-nums' : 'text-left',
                    )}
                  >
                    {formatPreviewCell(cell, sheet.kinds[index] ?? 'text')}
                  </td>
                ))}
              </tr>
            ))}
            {sheet.peek.length === 0 && sheet.rows !== null && (
              <tr className="border-t border-border">
                <td colSpan={sheet.columns.length} className="px-3 py-3 text-muted-foreground">
                  Nothing to list for these dates. The tab will hold the headings only.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sheet.peek.length > 0 && (sheet.rows === null || sheet.rows > sheet.peek.length) && (
        <p className="border-t border-border px-4 py-2 text-[12.5px] text-muted-foreground">First {sheet.peek.length} rows shown. The file has all of them.</p>
      )}
    </article>
  )
}

/** Exactly what the file will hold: every tab, its columns, how many rows, the first few. */
export function ExportPreviewPanel({ preview }: { preview: ExportPreview }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] text-muted-foreground">
        <span className="font-bold text-wn-ink">{preview.header.storeName}</span> · {preview.header.periodLabel} · {preview.header.branchLabel} · read{' '}
        {preview.header.asOf}
      </p>
      {preview.leftOut.map((sheet) => (
        <CoverageNote key={sheet.id} tone="warning">
          {sheet.note}
        </CoverageNote>
      ))}
      {preview.sheets.map((sheet) => (
        <SheetPreview key={sheet.id} sheet={sheet} />
      ))}
    </div>
  )
}
