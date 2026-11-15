import { SHEET_IDS, type SheetId } from './catalogue'
import { exportHref } from './request-schema'
import type { ExportLogEntry } from './server/export-log'

const KNOWN = new Set<string>(SHEET_IDS)

/**
 * The same file (sheets, custom report or saved format), dates and branch, read again NOW: no file
 * is kept, so figures may have moved since. Nothing is offered when the file can't be made the same
 * way any more (its saved format was removed, or its custom spec no longer reads).
 */
export function againHref(tenantId: string, entry: ExportLogEntry): string | null {
  // A saved format logs its tabs as `<sheet>:<n>`; the catalogue sheet is the part before the colon.
  const sheets = [...new Set(entry.sheets.map((id) => id.split(':')[0]))].filter((id): id is SheetId => KNOWN.has(id))
  if (sheets.length === 0) return null
  const shape = entry.shape
  if (shape.kind === 'template' && !shape.templateId) return null
  if (shape.kind === 'custom' && !shape.spec) return null
  return exportHref({
    tenantId,
    // A custom report names its one sheet; a saved format's sheets come from the format itself.
    sheets: shape.kind === 'custom' && shape.spec ? [shape.spec.sheet] : sheets,
    period: { preset: 'custom', from: entry.periodFrom, to: entry.periodTo },
    branch: entry.branch,
    format: entry.format,
    source: 'page',
    custom: shape.kind === 'custom' ? shape.spec : null,
    template: shape.kind === 'template' ? shape.templateId : null,
  })
}
