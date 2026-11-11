/**
 * Parity: the merchant app's denomination and reason modules must be
 * BYTE-IDENTICAL to the web's.
 *
 * The tablet counts the drawer and stores the denominations; the web shows the
 * same count on the shift sheet and the day close. If the two disagreed on a
 * key, a face value or a reason label, the owner would read a different total
 * or a different "what happened" for the same shift.
 *
 * The modules import nothing, so verbatim copies cost nothing. If this fails:
 * copy the web file over the app file — the web copy is the original.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const WEB_DIR = join(process.cwd(), 'src/lib/cash')
const APP_DIR = join(process.cwd(), 'webnegosyo-app/lib/cash')

const TWINS = ['denominations.ts', 'reasons.ts'] as const

function read(dir: string, file: string): string {
  return readFileSync(join(dir, file), 'utf8')
}

describe('cash twins — web vs merchant app', () => {
  it.each(TWINS)('%s is byte-identical', (file) => {
    expect(existsSync(join(APP_DIR, file))).toBe(true)
    expect(read(APP_DIR, file)).toBe(read(WEB_DIR, file))
  })

  it.each(TWINS)('%s imports nothing', (file) => {
    expect(read(WEB_DIR, file)).not.toMatch(/^\s*import\s/m)
  })
})
