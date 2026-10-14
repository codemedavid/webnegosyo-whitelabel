import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * store_activity_scrub() (20261012150000) replaces phone numbers and emails in
 * free text before it is stored. The two patterns are read from the migration
 * and exercised here (Postgres ARE and JS agree on this subset); the probe runs
 * the real SQL function too.
 */
const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261012150000_store_activity.sql'), 'utf8')

function pattern(marker: string): RegExp {
  const match = SQL.match(new RegExp(`-- scrub:${marker}\\n\\s*(?:p_text,\\n\\s*)?'([^']+)'`))
  if (!match) throw new Error(`scrub pattern ${marker} not found`)
  return new RegExp(match[1], 'g')
}

const EMAIL = pattern('email')
const PHONE = pattern('phone')

function scrub(text: string): string {
  return text.replace(EMAIL, '•••').replace(PHONE, '•••')
}

describe('store_activity_scrub patterns', () => {
  it.each([
    ['refund to 0917 123 4567 please', 'refund to ••• please'],
    ['call +63 917 123 4567', 'call •••'],
    ['call +639171234567', 'call •••'],
    ['call 63-917-123-4567', 'call •••'],
    ['09171234567', '•••'],
    ['mail lara.santos@example.com now', 'mail ••• now'],
    ['a.b+tag@shop.ph and 0998 765 4321', '••• and •••'],
  ])('scrubs %p', (input, expected) => {
    expect(scrub(input)).toBe(expected)
  })

  it.each([
    'Order #14 · 2 pcs · ₱185',
    'Wrong item served',
    'Receipt 20261012',
    'Table 12, 3 guests',
  ])('leaves %p alone', (input) => {
    expect(scrub(input)).toBe(input)
  })
})
