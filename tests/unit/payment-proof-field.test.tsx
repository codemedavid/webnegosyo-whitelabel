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
  uploadPaymentProofImage: jest.fn(),
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

describe('PaymentProofField — upload path', () => {
  it('sends the screenshot through the server upload route, never a direct ImageKit upload', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/react')
    const uploads = await import('@/lib/imagekit-upload')
    jest.mocked(uploads.uploadPaymentProofImage).mockResolvedValue({
      url: 'https://ik.imagekit.io/demo/payment-proofs/proof.jpg',
      fileId: 'f1',
      filePath: 'payment-proofs/proof.jpg',
    })
    const onUploaded = jest.fn()
    render(<PaymentProofField {...props} onUploaded={onUploaded} />)

    const input = screen.getByText(/upload screenshot/i).closest('label')!.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['x'], 'proof.jpg', { type: 'image/jpeg' })] } })

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://ik.imagekit.io/demo/payment-proofs/proof.jpg', 'f1'))
    expect(uploads.uploadPaymentProofImage).toHaveBeenCalled()
    expect(uploads.uploadImageToImageKit).not.toHaveBeenCalled()
  })
})
