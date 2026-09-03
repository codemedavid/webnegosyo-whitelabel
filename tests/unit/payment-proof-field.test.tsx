/**
 * Payment proof upload control.
 *
 * iOS Safari silently ignores programmatic `.click()` on a `display: none`
 * file input, so "Upload Screenshot" never opens the photo picker — the
 * customer-facing "upload modal". A native <label htmlFor> (or wrapping
 * <label>) is what actually opens the picker on phones.
 */

import { render, screen } from '@testing-library/react'
import { PaymentProofField } from '@/components/customer/payment-proof-field'

jest.mock('@/lib/imagekit-upload', () => ({
  isImageKitConfigured: () => true,
  uploadImageToImageKit: jest.fn(),
}))

const props = {
  required: true,
  screenshotUrl: '',
  reference: '',
  onUploaded: jest.fn(),
  onRemove: jest.fn(),
  onReferenceChange: jest.fn(),
}

describe('PaymentProofField — upload picker', () => {
  it('nests the file input inside the Upload Screenshot label so the native picker opens on iOS', () => {
    render(<PaymentProofField {...props} />)

    const uploadControl = screen.getByText(/upload screenshot/i).closest('label')
    expect(uploadControl).not.toBeNull()
    const fileInput = uploadControl!.querySelector('input[type="file"]')
    expect(fileInput).toBeTruthy()
    expect(fileInput).not.toHaveClass('hidden')
    expect(fileInput).not.toHaveClass('sr-only')
  })
})
