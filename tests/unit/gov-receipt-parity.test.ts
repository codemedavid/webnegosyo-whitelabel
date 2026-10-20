/**
 * Parity: the Senior/PWD order summary and the receipt's tax identity are
 * BYTE-IDENTICAL in the web and the merchant app.
 *
 * The register prints with the app copy; the admin dialog, the Studio preview
 * and the browser print use the web copy. If they drift, the paper names one
 * claimant or VAT figure and the admin screen another.
 *
 * If this fails: copy the web file over the app file.
 */
import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

const SHARED_MODULES = ['order-gov-summary.ts', 'receipt-tax.ts'] as const

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('Senior/PWD receipt helpers — web vs merchant app', () => {
  it.each(SHARED_MODULES)('%s is byte-identical', (file) => {
    expect(read(`webnegosyo-app/lib/${file}`)).toBe(read(`src/lib/${file}`))
  })

  it.each(SHARED_MODULES)('%s stays portable: relative imports only', (file) => {
    expect(read(`src/lib/${file}`)).not.toMatch(/from ["'](@\/|[^"']*supabase|[^"']*convex|react)/)
  })
})
