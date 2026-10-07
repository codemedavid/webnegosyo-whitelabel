import { act, renderHook } from '@testing-library/react'

const fetchMock = jest.fn(async () => ({ ok: true }))
const FIRST_URL = 'https://ik.imagekit.io/acme/payment-proofs/first.png'
const SECOND_URL = 'https://ik.imagekit.io/acme/payment-proofs/second.png'

beforeEach(() => {
  fetchMock.mockClear()
  global.fetch = fetchMock as unknown as typeof fetch
})

async function renderPaymentProof() {
  // Imported lazily: next/jest does not hoist mocks above static imports.
  const { usePaymentProof } = await import('@/hooks/checkout/use-payment-proof')
  return renderHook(() => usePaymentProof())
}

function deletedFileIds(): string[] {
  return fetchMock.mock.calls.map(call => {
    const [url, init] = call as unknown as [string, RequestInit]
    expect(url).toBe('/api/payment-proof/delete')
    return JSON.parse(String(init.body)).fileId
  })
}

describe('usePaymentProof', () => {
  it('starts empty', async () => {
    const { result } = await renderPaymentProof()

    expect(result.current.paymentProof).toEqual({ url: '', publicId: '', reference: '' })
  })

  it('stores an upload and deletes the screenshot it replaces', async () => {
    const { result } = await renderPaymentProof()

    act(() => result.current.handlePaymentProofUploaded(FIRST_URL, 'file-1'))
    act(() => result.current.handlePaymentProofUploaded(SECOND_URL, 'file-2'))

    expect(result.current.paymentProof).toEqual({ url: SECOND_URL, publicId: 'file-2', reference: '' })
    expect(deletedFileIds()).toEqual(['file-1'])
  })

  it('does not delete when the same file is reported twice', async () => {
    const { result } = await renderPaymentProof()

    act(() => result.current.handlePaymentProofUploaded(FIRST_URL, 'file-1'))
    act(() => result.current.handlePaymentProofUploaded(FIRST_URL, 'file-1'))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('removes the screenshot and deletes the stored file, keeping the reference', async () => {
    const { result } = await renderPaymentProof()

    act(() => {
      result.current.handlePaymentProofUploaded(FIRST_URL, 'file-1')
      result.current.setPaymentProofReference('REF-1')
    })
    act(() => result.current.handleRemovePaymentProof())

    expect(result.current.paymentProof).toEqual({ url: '', publicId: '', reference: 'REF-1' })
    expect(deletedFileIds()).toEqual(['file-1'])
  })

  it('has nothing to delete when no screenshot was uploaded', async () => {
    const { result } = await renderPaymentProof()

    act(() => result.current.handleRemovePaymentProof())

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
