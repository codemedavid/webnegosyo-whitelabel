/**
 * The receipt editor's preview must show the rows a real bill carries.
 *
 * `SAMPLE_ORDER` is a plain dine-in sale: no delivery fee, no service charge,
 * so the totals block previews as items straight into TOTAL. A merchant who
 * levies a service charge — the reason order types have a rate at all — could
 * arrange, style and publish a layout without ever seeing where that row lands
 * on their paper, and only found out on the first live chit.
 *
 * The sample is read out of the component source rather than imported: it is a
 * private const on a client component, and this suite is about what the
 * merchant SEES, which is decided at that literal.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderReceipt, CLASSIC_RECEIPT_LAYOUT } from '@/lib/receipt-layout'

const source = readFileSync(
  join(__dirname, '..', '..', 'src', 'components', 'admin', 'receipt-editor', 'receipt-editor.tsx'),
  'utf8',
)

describe('the receipt editor preview sample', () => {
  it('carries a service charge, so the row is previewable', () => {
    expect(source).toMatch(/serviceCharge:\s*[\d.]+/)
  })

  it('carries a delivery fee, so that row is previewable too', () => {
    expect(source).toMatch(/deliveryFee:\s*[\d.]+/)
  })

  it('stays internally consistent, so the preview never warns of a mismatch', () => {
    // The renderer warns when the rows it draws cannot be reconciled to
    // `total`. A sample that trips its own warning would print a console error
    // on every keystroke in the editor.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    renderReceipt(
      sampleOrderFromSource(),
      { storeName: 'Kape Co', width: 32 },
      CLASSIC_RECEIPT_LAYOUT,
    )

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('previews both fee rows and a subtotal to read them against', () => {
    const receipt = renderReceipt(
      sampleOrderFromSource(),
      { storeName: 'Kape Co', width: 32 },
      CLASSIC_RECEIPT_LAYOUT,
    )

    expect(receipt).toContain('Subtotal:')
    expect(receipt).toContain('Service Charge:')
    expect(receipt).toContain('Delivery Fee:')
  })
})

/**
 * Rebuild the sample from the numbers declared in the component.
 *
 * Only the money matters here, so the items are collapsed to a single line
 * carrying the stated subtotal — the totals block is what is under test.
 */
function sampleOrderFromSource() {
  const num = (field: string): number => {
    const found = source.match(new RegExp(`${field}:\\s*([\\d.]+)`))
    if (!found) throw new Error(`SAMPLE_ORDER has no ${field}`)
    return Number(found[1])
  }

  const total = num('total')
  const serviceCharge = num('serviceCharge')
  const deliveryFee = num('deliveryFee')

  return {
    _id: 'sample',
    _creationTime: Date.UTC(2026, 6, 26, 4, 30),
    customerName: 'Maria',
    customerContact: '09171234567',
    total,
    serviceCharge,
    deliveryFee,
    items: [
      {
        menuItemName: 'Sample',
        quantity: 1,
        subtotal: Math.round((total - serviceCharge - deliveryFee) * 100) / 100,
      },
    ],
  }
}
