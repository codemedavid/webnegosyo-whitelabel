/**
 * The customer tracking payload never carries the order's stored blob, so a
 * Senior/PWD claimant's ID number (kept on the order for the staff receipt —
 * BIR requires it there) cannot reach the public tracking page. Pinned so a
 * future field does not quietly add it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(process.cwd(), 'src/lib/order-tracking-service.ts'), 'utf8')
const dto = source.slice(source.indexOf('export interface TrackingData'), source.indexOf('\n}\n', source.indexOf('export interface TrackingData')))

describe('TrackingData', () => {
  it('has no customer_data, discount or government field', () => {
    expect(dto).not.toMatch(/customer_?[dD]ata\??:/)
    expect(dto).not.toMatch(/discount|government|idNumber/i)
  })
})
