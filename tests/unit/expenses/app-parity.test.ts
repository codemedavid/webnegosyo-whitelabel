/**
 * Parity: the merchant app's copy of the expenses engine must be BYTE-IDENTICAL
 * to the web's.
 *
 * The phone records most expenses (often offline, at the palengke) and the web
 * reviews them. If the two disagreed on a category's group, a keypad amount, a
 * "Needs a look" flag or a month total, the owner would see one figure on the
 * phone and another on the web for the same peso.
 *
 * These modules import nothing but each other (no Supabase, React, zod or
 * `@/` alias), so verbatim copies cost nothing. If this fails: copy the web
 * file over the app file — the web copy is the original.
 *
 * `export.ts` is web-only (the accountant export runs on the server) and is
 * deliberately not ported.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const WEB_DIR = join(process.cwd(), 'src/lib/expenses')
const APP_DIR = join(process.cwd(), 'webnegosyo-app/lib/expenses')

const PORTED_MODULES = [
  'types.ts',
  'manila-date.ts',
  'categories.ts',
  'keypad.ts',
  'repeat-chips.ts',
  'sort-suggest.ts',
  'flags.ts',
  'totals.ts',
] as const

function read(dir: string, file: string): string {
  return readFileSync(join(dir, file), 'utf8')
}

describe('expenses engine parity — web vs merchant app', () => {
  it.each(PORTED_MODULES)('%s is byte-identical', (file) => {
    expect(existsSync(join(APP_DIR, file))).toBe(true)
    expect(read(APP_DIR, file)).toBe(read(WEB_DIR, file))
  })

  it.each(PORTED_MODULES)('%s imports only sibling engine modules', (file) => {
    const imports = [...read(WEB_DIR, file).matchAll(/from '([^']+)'/g)].map((match) => match[1])
    const allowed = PORTED_MODULES.map((module) => `./${module.replace(/\.ts$/, '')}`)
    expect(imports.filter((path) => !allowed.includes(path))).toEqual([])
  })
})
