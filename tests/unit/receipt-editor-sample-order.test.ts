/**
 * The receipt editor's preview must show the rows a real bill carries.
 *
 * A plain dine-in sample — no delivery fee, no service charge — previews the
 * totals block as items straight into TOTAL. A merchant who levies a service
 * charge could arrange, style and publish a layout without ever seeing where
 * that row lands on their paper, and only find out on the first live chit.
 */
import { renderReceipt, CLASSIC_RECEIPT_LAYOUT } from '@/lib/receipt-layout'
import { SAMPLE_ORDER } from '@/components/admin/receipt-editor/sample-order'

const config = { storeName: 'Kape Co', width: 32 }

describe('the receipt editor preview sample', () => {
  it('carries a service charge and a delivery fee, so both rows are previewable', () => {
    expect(SAMPLE_ORDER.serviceCharge).toBeGreaterThan(0)
    expect(SAMPLE_ORDER.deliveryFee).toBeGreaterThan(0)
  })

  it('stays internally consistent, so the preview never warns of a mismatch', () => {
    // The renderer warns when the rows it draws cannot be reconciled to
    // `total`. A sample that trips its own warning would print a console error
    // on every keystroke in the editor.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    renderReceipt(SAMPLE_ORDER, config, CLASSIC_RECEIPT_LAYOUT)

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('previews both fee rows and a subtotal to read them against', () => {
    const receipt = renderReceipt(SAMPLE_ORDER, config, CLASSIC_RECEIPT_LAYOUT)

    expect(receipt).toContain('Subtotal:')
    expect(receipt).toContain('Service Charge:')
    expect(receipt).toContain('Delivery Fee:')
  })
})
