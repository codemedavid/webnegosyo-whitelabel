/**
 * Parity: the merchant app's Profit screen runs the web's ONE profit
 * definition, not a copy that can drift.
 *
 * - `profit-model.ts` is copied byte-for-byte; only its two import specifiers
 *   differ (the app has no `@/` alias, and no room for the SQL twin's fact
 *   engine in `profit-facts.ts`).
 * - `profit-types.ts` holds the row types the model reads; every declaration
 *   in it must appear verbatim in the web's `profit-facts.ts`.
 *
 * If this fails: copy the web file over the app file (rewriting the two
 * imports), or re-copy the declaration — the web copy is the original.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const WEB = join(process.cwd(), 'src/lib/reports')
const APP = join(process.cwd(), 'webnegosyo-app/lib/profit')

const read = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8')

/** The only lines allowed to differ, as [web, app]. */
const IMPORT_REWRITES: readonly (readonly [string, string])[] = [
  ["import type { ExpenseGroup } from '@/lib/expenses/types'", "import type { ExpenseGroup } from '../expenses/types'"],
  ["from './profit-facts'", "from './profit-types'"],
]

function asApp(web: string): string {
  return IMPORT_REWRITES.reduce((text, [from, to]) => text.split(from).join(to), web)
}

/** Every top-level `export …` declaration in a file, with its doc comment. */
function declarations(source: string): string[] {
  const pattern = /(?:\/\*\*(?:(?!\*\/)[^])*\*\/\n)?export (?:interface|const|type) [^]*?(?=\n\n|\n?$)/g
  return [...source.matchAll(pattern)].map((match) => match[0].trim())
}

describe('profit engine parity — web vs merchant app', () => {
  it('profit-model.ts is the web file with only its imports rewritten', () => {
    expect(read(APP, 'profit-model.ts')).toBe(asApp(read(WEB, 'profit-model.ts')))
  })

  it('profit-types.ts declares nothing the web does not, word for word', () => {
    const web = read(WEB, 'profit-facts.ts')
    const appDeclarations = declarations(read(APP, 'profit-types.ts'))
    const joined = appDeclarations.join('\n')
    for (const name of ['ProfitFigures', 'ProfitPeriodFigures', 'ExpenseCategoryTotal', 'EXPENSE_LINE_GROUPS', 'ProfitGrain']) {
      expect(joined).toContain(name)
    }
    for (const declaration of appDeclarations) {
      expect({ declaration, inWeb: web.includes(declaration) }).toEqual({ declaration, inWeb: true })
    }
  })
})
