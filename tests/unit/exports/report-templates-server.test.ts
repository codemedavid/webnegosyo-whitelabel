/** @jest-environment node */
/**
 * Saved formats, written and read as the CALLER: every refusal the database
 * can give comes back as a sentence the person can act on, and a write is
 * believed only when its row came back (RLS refuses a delete with zero rows).
 */
import { customReportSpecSchema } from '@/lib/exports/custom-report'
import { ExportError } from '@/lib/exports/errors'
import { listReportTemplates, loadTemplateCards, removeReportTemplate, saveReportTemplate } from '@/lib/exports/server/report-templates'

const mockCreateClient = jest.fn()
jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/server', () => ({ createClient: () => mockCreateClient() }))

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const ID = 'bbbbbbbb-0000-4000-8000-000000000001'
const spec = customReportSpecSchema.parse({ title: 'Average order per day', sheet: 'sales_by_day', columns: [{ id: 'day' }, { id: 'aov' }] })
const stored = (overrides: Record<string, unknown> = {}) => ({ id: ID, name: 'Weekly', kind: 'custom', spec, created_by_label: 'Ana', created_at: '2026-11-14T02:00:00Z', ...overrides })

interface Answer {
  data?: unknown
  error?: { code?: string; message: string } | null
}

/** A session client whose `report_templates` calls answer as told and are written down. */
function client(answers: { list?: Answer; insert?: Answer; remove?: Answer }) {
  const calls: Array<{ op: string; args: unknown[] }> = []
  const chain = (op: string, answer: Answer | undefined) => {
    const result = { data: answer?.data ?? null, error: answer?.error ?? null }
    const link: Record<string, unknown> = {}
    for (const method of ['eq', 'order', 'limit', 'select']) link[method] = (...args: unknown[]) => (calls.push({ op: `${op}.${method}`, args }), link)
    link.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
    return link
  }
  mockCreateClient.mockResolvedValue({
    from: (table: string) => {
      if (table === 'app_users') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { display_name: ' Ana Reyes ', email: 'x@y.z' } }) }) }) }
      }
      if (table !== 'report_templates') throw new Error(`unexpected table ${table}`)
      return {
        select: (...args: unknown[]) => (calls.push({ op: 'list.select', args }), chain('list', answers.list)),
        insert: (...args: unknown[]) => (calls.push({ op: 'insert', args }), chain('insert', answers.insert)),
        delete: (...args: unknown[]) => (calls.push({ op: 'remove', args }), chain('remove', answers.remove)),
      }
    },
  })
  return calls
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())

describe('listReportTemplates', () => {
  it('reads this store’s formats and leaves out rows that no longer read as one', async () => {
    const calls = client({ list: { data: [stored(), stored({ id: 'not-a-uuid' }), stored({ name: 'Old', kind: 'format' })] } })
    const formats = await listReportTemplates(TENANT)
    expect(formats.map((format) => format.name)).toEqual(['Weekly'])
    expect(calls).toContainEqual({ op: 'list.eq', args: ['tenant_id', TENANT] })
  })

  it('throws when the read failed, and the page helper answers with none instead', async () => {
    client({ list: { error: { message: 'timeout' } } })
    await expect(listReportTemplates(TENANT)).rejects.toThrow(/saved formats could not be read/)
    expect(await loadTemplateCards(TENANT, { has: () => true }, false)).toEqual([])
  })
})

describe('saveReportTemplate', () => {
  const input = { tenantId: TENANT, userId: 'user-1', name: 'Weekly', spec }

  it('writes the caller’s own row and answers with the saved format', async () => {
    const calls = client({ insert: { data: [stored()] } })
    await expect(saveReportTemplate(input)).resolves.toMatchObject({ id: ID, name: 'Weekly' })
    expect(calls.find((call) => call.op === 'insert')?.args[0]).toEqual({ tenant_id: TENANT, name: 'Weekly', kind: 'custom', spec, created_by: 'user-1', created_by_label: 'Ana Reyes' })
  })

  it('refuses a spec whose column the sheet does not have, before anything is written', async () => {
    const calls = client({ insert: { data: [stored()] } })
    const bad = { ...spec, columns: [{ id: 'day' }, { id: 'profit' }] }
    await expect(saveReportTemplate({ ...input, spec: bad })).rejects.toMatchObject({ status: 400, message: 'Sales by day has no column called "profit".' })
    expect(calls).toEqual([])
  })

  it.each([
    [{ code: '23505', message: 'duplicate key value violates unique constraint' }, 409, /already have a format called “Weekly”/],
    [{ code: '42501', message: 'new row violates row-level security policy' }, 403, /see the whole store and hold the Reports permission/],
    [{ code: 'P0001', message: 'report_templates_limit' }, 409, /keeps up to 50 saved formats/],
  ])('words the database’s refusal %j', async (error, status, message) => {
    client({ insert: { error } })
    const failure = await saveReportTemplate(input).catch((caught: unknown) => caught)
    expect(failure).toBeInstanceOf(ExportError)
    expect(failure).toMatchObject({ status, message: expect.stringMatching(message) })
  })

  it('does not believe a save whose row did not come back', async () => {
    client({ insert: { data: [] } })
    await expect(saveReportTemplate(input)).rejects.toThrow(/no row came back/)
    client({ insert: { error: { code: '57014', message: 'canceling statement' } } })
    const failure = await saveReportTemplate(input).catch((caught: unknown) => caught)
    expect(failure).not.toBeInstanceOf(ExportError)
  })
})

describe('removeReportTemplate', () => {
  it('removes the named format of this store', async () => {
    const calls = client({ remove: { data: [{ id: ID }] } })
    await expect(removeReportTemplate(TENANT, ID)).resolves.toBeUndefined()
    expect(calls).toContainEqual({ op: 'remove.eq', args: ['tenant_id', TENANT] })
    expect(calls).toContainEqual({ op: 'remove.eq', args: ['id', ID] })
  })

  it('says so when nothing was removed (already gone, or RLS refused silently)', async () => {
    client({ remove: { data: [] } })
    await expect(removeReportTemplate(TENANT, ID)).rejects.toMatchObject({ status: 404 })
  })
})
