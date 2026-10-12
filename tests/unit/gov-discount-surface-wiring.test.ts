/**
 * Guardrail: every order surface that shows a discounted order's money also
 * says who a Senior/PWD discount was for. The discount rows alone read
 * "SC 20% · J. Dela Cruz" with no ID, share or VAT breakdown — which is what a
 * merchant needs when BIR or the owner asks about the sale.
 */
import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

const SURFACES: [file: string, component: string][] = [
  ['src/components/admin/order-detail-dialog.tsx', 'GovDiscountSummary'],
  ['src/components/admin/order-card.tsx', 'GovDiscountSummary'],
  ['src/components/admin/convex-order-sheet.tsx', 'GovDiscountSummary'],
  ['webnegosyo-app/app/(main)/order/[orderId].tsx', 'GovDiscountCard'],
]

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('order surfaces show the Senior/PWD detail', () => {
  it.each(SURFACES)('%s renders %s', (file, component) => {
    expect(read(file)).toContain(`<${component}`)
  })

  it('both components read the shared summary, not their own arithmetic', () => {
    expect(read('src/components/admin/gov-discount-summary.tsx')).toContain('govOrderSummary')
    expect(read('webnegosyo-app/components/order/GovDiscountCard.tsx')).toContain('govOrderSummary')
  })

  it('the web print paths hand the store tax identity to the engine', () => {
    expect(read('src/app/actions/receipt.ts')).toContain('readReceiptTaxIdentity')
    expect(read('src/components/admin/order-detail-dialog.tsx')).toContain('context?.tax')
    expect(read('src/components/admin/convex-order-sheet.tsx')).toContain('context?.tax')
    expect(read('webnegosyo-app/hooks/useOrderPrint.ts')).toContain('receiptTaxIdentity(taxProfile)')
  })
})
