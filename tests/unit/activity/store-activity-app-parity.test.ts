import { readFileSync } from 'fs'
import { join } from 'path'
import { parseStoreActivityRows as parseWeb, parseStoreActivitySummary as parseWebSummary } from '@/lib/activity/dto'
import {
  parseStoreActivityRows as parseApp,
  parseStoreActivitySummary as parseAppSummary,
} from '../../../webnegosyo-app/lib/activity/dto'
import {
  RAW_FUTURE_ROW,
  RAW_MISMATCH_ROW,
  RAW_REFUND_ROW,
  RAW_STOCK_ROW,
  RAW_SUMMARY,
} from '../../fixtures/store-activity-rows'

/**
 * The merchant app and the web read the same feed. taxonomy / store-event /
 * format / describe are kept as byte-identical copies; dto differs on purpose
 * (the app has no zod) and is held equal by behaviour instead.
 */
const SHARED = ['taxonomy.ts', 'store-event.ts', 'format.ts', 'describe.ts']

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('store activity app mirror', () => {
  it.each(SHARED)('%s is byte-identical in web and app', (file) => {
    expect(read(`webnegosyo-app/lib/activity/${file}`)).toBe(read(`src/lib/activity/${file}`))
  })

  it('both DTO parsers read rows identically', () => {
    const rows = [RAW_REFUND_ROW, RAW_STOCK_ROW, RAW_FUTURE_ROW, RAW_MISMATCH_ROW]
    expect(parseApp(rows)).toEqual(parseWeb(rows))
    expect(parseApp(null)).toEqual(parseWeb(null))
  })

  it('both DTO parsers read the summary identically', () => {
    expect(parseAppSummary(RAW_SUMMARY)).toEqual(parseWebSummary(RAW_SUMMARY))
  })

  it('both DTO parsers refuse the same malformed payloads', () => {
    for (const bad of [{ rows: [] }, [{ ...RAW_REFUND_ROW, id: 42 }], [{ ...RAW_REFUND_ROW, occurred_at: 'nope' }]]) {
      expect(() => parseWeb(bad)).toThrow()
      expect(() => parseApp(bad)).toThrow()
    }
  })
})
