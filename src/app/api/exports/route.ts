import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { ExportError } from '@/lib/exports/errors'
import { exportCatalogue } from '@/lib/exports/export-page-model'
import { exportQuerySchema, exportRequestSchema, type ExportRequest } from '@/lib/exports/request-schema'
import { previewCustomExport, runCustomExport } from '@/lib/exports/run-custom-export'
import { previewExport, runExport, toExportFile } from '@/lib/exports/run-export'
import { logExport } from '@/lib/exports/server/export-log'
import { loadExportInput, type LoadedExport } from '@/lib/exports/server/load-export-input'
import { templateSheets, type ReportTemplate } from '@/lib/exports/report-templates'
import { previewFormatExport, runFormatExport } from '@/lib/exports/run-format-export'
import type { ExportInput, ExportPreview, ExportResult } from '@/lib/exports/run-export'
import { getReportTemplate, loadTemplateCards } from '@/lib/exports/server/report-templates'
import { defineRoute } from '@/platform/http/define-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
/** Every store shares one database: a store's staff together get this many files a minute. */
const STORE_FILE_LIMIT = { limit: 12, windowSec: 60 } as const
/**
 * A custom report or saved-format preview reads the WHOLE period (up to the
 * file's own cap), unlike the plain preview's first 1,500 orders, so it is a
 * file read in all but name: counted per store like files, on its own bucket
 * so previewing never eats the store's downloads.
 */
const STORE_FULL_PREVIEW_LIMIT = { limit: 20, windowSec: 60 } as const
const STREAM_CHUNK_BYTES = 64 * 1024

const REFUSAL_MESSAGES: Readonly<Record<string, string>> = {
  no_account: 'Sign in again to export.',
  other_store: 'This account belongs to another store.',
  no_permission: 'You need the Reports permission to export. Ask the store owner.',
  platform_staff: 'Platform staff accounts cannot export store reports.',
}

function fail(status: number, error: string, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ success: false, error }, { status, headers: { ...NO_STORE, ...headers } })
}

function refusalFor(loaded: Exclude<LoadedExport, { kind: 'ready' }>): NextResponse {
  switch (loaded.kind) {
    case 'signed_out':
      return fail(401, REFUSAL_MESSAGES.no_account)
    case 'not_found':
      return fail(404, 'Store not found.')
    case 'refused':
      return fail(403, REFUSAL_MESSAGES[loaded.reason] ?? REFUSAL_MESSAGES.no_permission)
    case 'unsupported':
      return fail(409, 'Exports are for stores on the WebNegosyo database. This store still exports from the app.')
  }
}

/** A refusal the person can act on keeps its own sentence; anything else is logged and worded plainly. */
function failure(error: unknown, what: string): NextResponse {
  if (error instanceof ExportError) return fail(error.status, error.message)
  console.error(`[exports] ${what} failed`, error instanceof Error ? error.message : error)
  return fail(500, 'The export could not be prepared. Try again in a moment.')
}

/** The saved format a request names, read as the CALLER. Gone, another store's or not this account's = the same refusal. */
async function templateFor(request: ExportRequest): Promise<ReportTemplate | null> {
  if (!request.template) return null
  const template = await getReportTemplate(request.tenantId, request.template)
  if (!template) throw new ExportError('That saved format is gone, or this account may not use it. Open Export to see what is saved.', 404)
  return template
}

/** A saved format decides its own sheets; the file is called after it. */
async function runTemplate(input: ExportInput, template: ReportTemplate): Promise<ExportResult> {
  const own = { ...input, sheets: templateSheets(template) }
  if (template.kind === 'format') return runFormatExport(own, template.spec, template.name)
  return { ...(await runCustomExport(own, template.spec)), title: template.name }
}

async function previewTemplate(input: ExportInput, template: ReportTemplate): Promise<ExportPreview> {
  const own = { ...input, sheets: templateSheets(template) }
  return template.kind === 'format' ? previewFormatExport(own, template.spec) : previewCustomExport(own, template.spec)
}

/**
 * POST /api/exports — what a file WOULD hold: the sheets this caller gets,
 * their columns, row counts and first rows, and anything left out and why.
 * Nothing is logged; nothing leaves but the peek. `mode: 'catalogue'` answers
 * with the sheets and ready-made sets this account may pick instead.
 *
 * Reads run as the CALLER (cookie session or the app's Bearer token), so RLS
 * and the staff keys decide every row; a branch-locked account always gets its
 * own branch (`report-context.ts`), which is why the branch rule here is 'any'.
 */
export const POST = defineRoute({
  auth: { kind: 'staff', permission: 'reports', branch: 'any', access: 'view', storeClaim: ({ body }) => body.tenantId },
  // The Export page previews on every change of sheet or date.
  rateLimit: { bucket: 'exports-preview', per: 'user', max: 30, window: '1m' },
  body: exportRequestSchema,
  handler: async ({ body }) => {
    try {
      const loaded = await loadExportInput(body)
      if (loaded.kind !== 'ready') return refusalFor(loaded)
      if (body.mode === 'catalogue') {
        // The merchant app's Export screen: what this account may pick. No order is read.
        const { context, access } = loaded.input
        // Saved formats ("My formats"): a link names one by id (`&template=`), the server reads its shape.
        const formats = await loadTemplateCards(body.tenantId, access, context.isMultiBranch)
        return NextResponse.json(
          {
            success: true,
            catalogue: {
              ...exportCatalogue(access, context.isMultiBranch),
              today: context.today,
              branchLabel: context.lockedBranchLabel,
              isMixedBackend: context.isMixedBackend,
              formats,
            },
          },
          { headers: NO_STORE },
        )
      }
      const template = await templateFor(body)
      if (template || body.custom) {
        const store = await checkRateLimit(`exports:store-preview:${body.tenantId}`, STORE_FULL_PREVIEW_LIMIT)
        if (!store.allowed) return fail(429, 'Your store is previewing a lot of reports right now. Give it a minute.', { 'Retry-After': String(store.retryAfterSec) })
      }
      const preview = template
        ? await previewTemplate(loaded.input, template)
        : body.custom
          ? await previewCustomExport(loaded.input, body.custom)
          : await previewExport(loaded.input)
      return NextResponse.json({ success: true, preview }, { headers: NO_STORE })
    } catch (error) {
      return failure(error, 'preview')
    }
  },
})

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close()
      controller.enqueue(bytes.subarray(offset, offset + STREAM_CHUNK_BYTES))
      offset += STREAM_CHUNK_BYTES
    },
  })
}

async function buildFile(request: ExportRequest): Promise<Response> {
  const loaded = await loadExportInput(request)
  if (loaded.kind !== 'ready') return refusalFor(loaded)
  const store = await checkRateLimit(`exports:store:${request.tenantId}`, STORE_FILE_LIMIT)
  if (!store.allowed) return fail(429, 'Your store is exporting a lot right now. Give it a minute.', { 'Retry-After': String(store.retryAfterSec) })

  const template = await templateFor(request)
  const result = template
    ? await runTemplate(loaded.input, template)
    : request.custom
      ? await runCustomExport(loaded.input, request.custom)
      : await runExport(loaded.input)
  const file = await toExportFile(result, loaded.input.context, request.format)
  // The log row is the record that this data left: no row, no file.
  await logExport(loaded.userId, request, loaded.input.context, result, file.bytes.length)
  // Streamed, so a large workbook is not held to the platform's response-size cap.
  return new Response(stream(file.bytes), {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': file.contentType,
      'Content-Length': String(file.bytes.length),
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'X-Export-Sheets': result.sheets.map((sheet) => sheet.id).join(','),
    },
  })
}

/**
 * GET /api/exports?tenantId=…&sheets=orders,order_lines&period=custom&from=…&to=…[&branch=…][&format=csv][&source=owl][&custom=…|&template=<saved format id>]
 * — the file itself, built now, as the CALLER. A plain link, so a browser
 * saves it and "Recent exports" can run one again. Nothing is stored: the
 * file is read, logged (`report_exports`) and streamed.
 */
export const GET = defineRoute({
  auth: { kind: 'staff', permission: 'reports', branch: 'any', access: 'view', storeClaim: ({ query }) => query.tenantId },
  // A file reads every row of its period: a person needs a few a minute, a script wants hundreds.
  rateLimit: { bucket: 'exports-file', per: 'user', max: 6, window: '1m' },
  query: exportQuerySchema,
  handler: async ({ query }) => {
    try {
      return await buildFile(query)
    } catch (error) {
      return failure(error, 'file')
    }
  },
})
