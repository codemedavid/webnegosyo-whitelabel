/**
 * @jest-environment node
 */
/**
 * Ratchets: counts of things the codebase has too many of, pinned at today's
 * value in `ratchets.json`. Each may only go DOWN.
 *
 * - Above the ceiling: the change added one more. The message says what to do
 *   instead.
 * - Below the ceiling: the change removed some. Lower the number in
 *   `ratchets.json` in the same change, so the progress cannot be undone.
 *
 * Nothing here says today's numbers are acceptable; they are where the
 * counting starts. Plain file walk + regex, no parser, so it runs in well
 * under a second and reads the same on every machine.
 *
 * To see every current value at once: RATCHETS_PRINT=1 npx jest
 * --config jest.config.cjs --testPathPatterns="guardrails/ratchets"
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ceilings from './ratchets.json'
import generated from './generated-files.json'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const TEST_FILE = /\.(test|spec)\.[a-z]+$/
/** Written by a tool, so its size and contents are not ours to ratchet. Listed by name, never by pattern (generated-files.test.ts). */
const GENERATED_FILES: readonly string[] = Object.keys(generated.files)
const SKIPPED_DIRS: readonly string[] = ['node_modules', '.next', '__tests__', '__mocks__']
const LONG_FILE_LINES = 800

interface SourceFile {
  /** Repo-relative, posix separators. */
  file: string
  source: string
}

function isGenerated(file: string): boolean {
  return GENERATED_FILES.includes(file)
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return []
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIPPED_DIRS.includes(entry.name) ? [] : walk(full)
    return [full]
  })
}

const posix = (full: string) => path.relative(ROOT, full).split(path.sep).join('/')

/** Every hand-written, non-test code file under `src/`, read once. */
const sources: SourceFile[] = walk(SRC)
  .map(posix)
  .filter((file) => CODE_FILE.test(file) && !TEST_FILE.test(file) && !file.endsWith('.d.ts') && !isGenerated(file))
  .sort()
  .map((file) => ({ file, source: readFileSync(path.join(ROOT, file), 'utf8') }))

/** Files (not folders, not dotfiles) directly inside a folder. */
function looseFiles(folder: string): number {
  return readdirSync(path.join(ROOT, folder), { withFileTypes: true }).filter(
    (entry) => entry.isFile() && !entry.name.startsWith('.'),
  ).length
}

function lineCount(source: string): number {
  if (source === '') return 0
  const breaks = source.split('\n').length - 1
  return source.endsWith('\n') ? breaks : breaks + 1
}

function filesMatching(pattern: RegExp, except: (file: string) => boolean = () => false): string[] {
  return sources.filter(({ file, source }) => !except(file) && pattern.test(source)).map(({ file }) => file)
}

function occurrences(pattern: RegExp): number {
  return sources.reduce((total, { source }) => total + (source.match(pattern)?.length ?? 0), 0)
}

const ADMIN_CLIENT_AREAS = ['src/app/api', 'src/app/actions', 'src/lib', 'src/components'] as const
type AdminClientArea = (typeof ADMIN_CLIENT_AREAS)[number] | 'elsewhere'

function adminClientArea(file: string): AdminClientArea {
  return ADMIN_CLIENT_AREAS.find((area) => file.startsWith(`${area}/`)) ?? 'elsewhere'
}

const adminClientFiles = filesMatching(/\bcreateAdminClient\b/, (file) => file === 'src/lib/supabase/admin.ts')

const measured = {
  looseLibFiles: looseFiles('src/lib'),
  looseAdminComponentFiles: looseFiles('src/components/admin'),
  filesOver800Lines: sources.filter(({ source }) => lineCount(source) > LONG_FILE_LINES).map(({ file }) => file),
  adminClientImporters: Object.fromEntries(
    [...ADMIN_CLIENT_AREAS, 'elsewhere' as const].map((area) => [
      area,
      adminClientFiles.filter((file) => adminClientArea(file) === area).length,
    ]),
  ) as Record<AdminClientArea, number>,
  convexDeploymentUrlReaders: filesMatching(
    /convex_deployment_url/,
    // The one place the backend is chosen, the table's type declarations, and
    // the operator switch SQL, which only checks the URL before clearing it.
    (file) =>
      file === 'src/lib/order-backend.ts' || file.startsWith('src/types/') || file === 'src/lib/convex-import/sql.ts',
  ).length,
  handWrittenDatabaseTypeImporters: filesMatching(/['"]@\/types\/database['"]/).length,
  utcDateAsBusinessDay:
    occurrences(/toISOString\(\)\s*\.(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)/g) +
    occurrences(/\.split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/g),
}

if (process.env.RATCHETS_PRINT === '1') {
  // The documented way to read every current value at once.
  console.log(JSON.stringify(measured, null, 2))
}

/** Fails above the ceiling (with what to do instead) and below it (lower the ceiling). */
function expectAtCeiling(name: string, actual: number, ceiling: number, instead: string): void {
  if (actual > ceiling) {
    throw new Error(`${name}: ${actual}, above the ceiling of ${ceiling}. ${instead}`)
  }
  if (actual < ceiling) {
    throw new Error(`${name}: ${actual}, below the ceiling of ${ceiling}. Lower the ceiling to ${actual} in tests/unit/guardrails/ratchets.json so it cannot creep back.`)
  }
}

describe('ratchets: these counts only go down', () => {
  it('reads the source tree (guards the scan itself)', () => {
    expect(sources.length).toBeGreaterThan(1000)
    expect(sources.some(({ file }) => file === 'src/lib/order-backend.ts')).toBe(true)
    expect(sources.some(({ file }) => isGenerated(file) || TEST_FILE.test(file))).toBe(false)
  })

  it('1. loose files directly in src/lib', () => {
    expectAtCeiling(
      'Loose files in src/lib',
      measured.looseLibFiles,
      ceilings.looseLibFiles,
      'Put new code in the folder for its domain (src/lib/<domain>/, or src/platform/ for cross-cutting plumbing), not directly in src/lib.',
    )
  })

  it('2. loose files directly in src/components/admin', () => {
    expectAtCeiling(
      'Loose files in src/components/admin',
      measured.looseAdminComponentFiles,
      ceilings.looseAdminComponentFiles,
      'Put a new admin component in the folder for its screen (src/components/admin/<feature>/).',
    )
  })

  it('3. source files over 800 lines', () => {
    const allowed = new Set<string>(ceilings.filesOver800Lines)
    const current = new Set(measured.filesOver800Lines)
    const grown = measured.filesOver800Lines.filter((file) => !allowed.has(file))
    const shrunk = ceilings.filesOver800Lines.filter((file) => !current.has(file))

    expect(grown.map((file) => `${file} is now over ${LONG_FILE_LINES} lines: split it (move a cohesive part into its own module) instead of growing it`)).toEqual([])
    expect(shrunk.map((file) => `${file} is no longer over ${LONG_FILE_LINES} lines (or is gone): remove it from filesOver800Lines in tests/unit/guardrails/ratchets.json`)).toEqual([])
    expect(ceilings.filesOver800Lines).toEqual([...ceilings.filesOver800Lines].sort())
  })

  it.each([...ADMIN_CLIENT_AREAS, 'elsewhere' as const])('4. files using the service-role client in %s', (area) => {
    expectAtCeiling(
      `Files using createAdminClient in ${area}`,
      measured.adminClientImporters[area],
      ceilings.adminClientImporters[area],
      "The service-role client bypasses row-level security. Read and write through the caller's own session client; where the service role is truly needed, add it to a module that already holds it rather than a new file.",
    )
  })

  it('5. files reading convex_deployment_url outside order-backend.ts', () => {
    expectAtCeiling(
      'Files reading convex_deployment_url',
      measured.convexDeploymentUrlReaders,
      ceilings.convexDeploymentUrlReaders,
      'Choose the backend with resolveOrderBackend(tenant) (src/lib/order-backend.ts): a leftover Convex URL on a platform store must not route reads or writes to Convex.',
    )
  })

  it('6. files importing the hand-written @/types/database', () => {
    expectAtCeiling(
      'Files importing @/types/database',
      measured.handWrittenDatabaseTypeImporters,
      ceilings.handWrittenDatabaseTypeImporters,
      'Type new code from the generated types (src/types/database.generated.ts, npm run db:types) or a local row interface; the hand-written file drifts from the real schema.',
    )
  })

  it("7. a UTC date used as a day: toISOString().slice(0, 10) / .split('T')[0]", () => {
    expectAtCeiling(
      'UTC-date-as-day expressions',
      measured.utcDateAsBusinessDay,
      ceilings.utcDateAsBusinessDay,
      'Stores are in Asia/Manila: before 8am there, the UTC date is still yesterday. Use toBusinessDayKey (src/lib/inventory/business-day.ts) for a business day.',
    )
  })
})
