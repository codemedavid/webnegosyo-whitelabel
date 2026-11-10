/**
 * @jest-environment node
 */
/**
 * Every API route and server action is a public URL, and each used to open
 * with its own hand-written check of who is calling. `defineRoute` /
 * `defineAction` (`src/platform/http/`) replace that prologue with a
 * declaration. This test makes the new way the only way for NEW code:
 *
 * - a route or action file is either fully declared through the wrapper, or
 *   listed in `entry-point-exceptions.json` (today's hand-checked files);
 * - a listed file that no longer exists, or is now fully declared, must come
 *   off the list.
 *
 * So the list can only shrink. The scan is plain text
 * (`scripts/lib/entry-points.mjs`), which is why a wrapped handler must be
 * written `export const NAME = defineRoute({ … })` with the declaration inline.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  analyzeEntryPoints,
  analyzeEntrySource,
  blankComments,
  renderEntryPointsDoc,
} from '../../../scripts/lib/entry-points.mjs'
import exceptionList from './entry-point-exceptions.json'

const ROOT = process.cwd()
const exceptions: readonly string[] = exceptionList.files
const entries = analyzeEntryPoints(ROOT)
const wrapperFor = (file: string) => (file.includes('/app/api/') ? 'defineRoute' : 'defineAction')

describe('entry points go through defineRoute / defineAction', () => {
  it('finds the route and action files (guards the scan itself)', () => {
    expect(entries.filter((entry) => entry.kind === 'route').length).toBeGreaterThanOrEqual(100)
    expect(entries.filter((entry) => entry.kind === 'action').length).toBeGreaterThanOrEqual(50)
  })

  it('understands every file: each one exports at least one handler it can see', () => {
    // A file the scan reads as empty would pass every other check by saying nothing.
    const unread = entries.filter((entry) => entry.handlers.length === 0).map((entry) => entry.file)
    expect(unread).toEqual([])
  })

  it('new routes must use defineRoute, new actions defineAction', () => {
    const listed = new Set(exceptions)
    const undeclared = entries
      .filter((entry) => !entry.isFullyWrapped && !listed.has(entry.file))
      .map((entry) => {
        const byHand = entry.handlers.filter((handler) => !handler.isWrapped).map((handler) => handler.name)
        return `${entry.file}: new routes must use defineRoute (new actions defineAction). Still by hand: ${byHand.join(', ')}. Write \`export const NAME = ${wrapperFor(entry.file)}({ auth, …, handler })\`; do not add the file to entry-point-exceptions.json.`
      })
    expect(undeclared).toEqual([])
  })

  it('lists no file that is gone', () => {
    const missing = exceptions.filter((file) => !existsSync(path.join(ROOT, file)))
    expect(missing.map((file) => `${file}: no longer exists; remove it from the exception list`)).toEqual([])
  })

  it('lists no file that is now fully declared', () => {
    const declared = new Set(entries.filter((entry) => entry.isFullyWrapped).map((entry) => entry.file))
    const stale = exceptions.filter((file) => declared.has(file))
    expect(stale.map((file) => `${file}: every handler is wrapped now; remove it from the exception list`)).toEqual([])
  })

  it('lists only entry-point files, sorted, once each', () => {
    const known = new Set(entries.map((entry) => entry.file))
    expect(exceptions.filter((file) => existsSync(path.join(ROOT, file)) && !known.has(file))).toEqual([])
    expect([...exceptions]).toEqual([...new Set(exceptions)].sort())
  })

  it('can read every declaration, so the table of entry points is complete', () => {
    const unreadable = entries.flatMap((entry) =>
      entry.handlers
        .filter((handler) => handler.isWrapped && handler.declaration === null)
        .map((handler) => `${entry.file} ${handler.name}: write the declaration inline, with auth: { kind: '…' } as a literal`),
    )
    expect(unreadable).toEqual([])
  })

  it('keeps docs/generated/entry-points.md current', () => {
    const file = path.join(ROOT, 'docs', 'generated', 'entry-points.md')
    const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
    // Stale? Run: node scripts/generate-entry-points.mjs
    expect(current).toBe(renderEntryPointsDoc(entries))
  })
})

describe('the scan', () => {
  const names = (kind: 'route' | 'action', source: string) =>
    analyzeEntrySource(kind, source).handlers.map((handler) => `${handler.name}:${handler.isWrapped ? 'wrapped' : 'by hand'}`)

  it('sees every way a route exports a method', () => {
    const source = [
      "export const runtime = 'nodejs'",
      'export const maxDuration = 20',
      'export async function GET(request: NextRequest) {}',
      'export function POST(request: NextRequest) {}',
      'export const PUT = handler',
      'export const PATCH = defineRoute({ auth: { kind: "cron" }, handler })',
      'export const { DELETE } = handlers',
      'export { cors as OPTIONS, HEAD }',
    ].join('\n')

    expect(names('route', source).sort()).toEqual(
      ['DELETE:by hand', 'GET:by hand', 'HEAD:by hand', 'OPTIONS:by hand', 'PATCH:wrapped', 'POST:by hand', 'PUT:by hand'].sort(),
    )
    expect(analyzeEntrySource('route', source).isFullyWrapped).toBe(false)
  })

  it('counts a route as declared only when every method is wrapped', () => {
    const source = [
      'export const dynamic = "force-dynamic"',
      "export const GET = defineRoute({ auth: { kind: 'public' }, rateLimit: { per: 'none', reason: 'static' }, handler })",
      "export const POST = defineRoute<Body>({\n  auth: { kind: 'staff', permission: 'pos', branch: 'own' },\n  handler,\n})",
    ].join('\n')

    expect(analyzeEntrySource('route', source).isFullyWrapped).toBe(true)
  })

  it('is not fooled by a wrapper of the wrong kind, an alias or a comment', () => {
    expect(names('route', 'export const GET = defineAction({})')).toEqual(['GET:by hand'])
    expect(names('route', 'const route = defineRoute({})\nexport { route as GET }')).toEqual(['GET:by hand'])
    expect(names('route', '// export const GET = defineRoute({})\nexport async function GET() {}')).toEqual(['GET:by hand'])
    expect(names('route', '/*\nexport async function POST() {}\n*/\nexport const GET = defineRoute({ auth: { kind: "cron" } })')).toEqual(['GET:wrapped'])
  })

  it('sees every value a server action file exports, and ignores its types', () => {
    const source = [
      "'use server'",
      'export interface Result { success: boolean }',
      'export type Input = string',
      'export async function saveThing() {}',
      'export const readThing = defineAction({ auth: { kind: "public" }, rateLimit: { per: "none", reason: "x" }, args: [], handler })',
      'export const helper = async () => {}',
    ].join('\n')

    expect(names('action', source)).toEqual(['saveThing:by hand', 'readThing:wrapped', 'helper:by hand'])
  })

  it('reads a declaration as data', () => {
    const source = [
      'export const POST = defineRoute({',
      "  auth: { kind: 'staff', permission: ORDER_READ_KEYS, branch: 'own', access: 'view', session: 'bearer', storeClaim: ({ body }) => body.tenantId },",
      "  rateLimit: { bucket: 'reprint', per: 'user', max: 60, window: '1m' }, // per person",
      '  body: z.object({ tenantId: z.string(), note: z.string() }),',
      '  handler: async ({ tenant }) => NextResponse.json({ tenant }),',
      '})',
    ].join('\n')

    expect(analyzeEntrySource('route', source).handlers[0].declaration).toEqual({
      kind: 'staff',
      permission: 'ORDER_READ_KEYS',
      branch: 'own',
      access: 'view',
      session: 'bearer',
      scheme: undefined,
      namesStore: true,
      rateLimit: '60 per 1m per user (`reprint`)',
      validates: ['body'],
    })
  })

  it('reports a declaration it cannot read instead of guessing', () => {
    expect(analyzeEntrySource('route', 'export const GET = defineRoute(declaration)').handlers[0].declaration).toBeNull()
    expect(analyzeEntrySource('route', 'export const GET = defineRoute({ auth: CRON, handler })').handlers[0].declaration).toBeNull()
  })

  it('blanks comments without moving anything else', () => {
    const source = "const a = 'http://x' // note\n/* two\nlines */ const b = `// not a comment`"
    const blanked = blankComments(source)

    expect(blanked).toHaveLength(source.length)
    expect(blanked).toContain("'http://x'")
    expect(blanked).toContain('`// not a comment`')
    expect(blanked).not.toContain('note')
    expect(blanked).not.toContain('two')
  })
})
