/**
 * Receipt links are signed for five minutes. A "View" after that asks for a
 * fresh link instead of opening an expired one.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const fetchReceiptLink = jest.fn()
jest.mock('@/components/admin/expenses/receipt-client', () => ({
  fetchReceiptLink: (...args: unknown[]) => fetchReceiptLink(...args),
}))

const RECEIPT = { id: 'r-1', expenseId: 'e-1', mime: 'application/pdf', bytes: 10, uploadedBy: null, createdAt: '2026-10-21T00:00:00.000Z' }

async function renderPreviews() {
  const { ReceiptPreviews } = await import('@/components/admin/expenses/receipt-previews')
  render(<ReceiptPreviews receipts={[RECEIPT]} />)
  return screen.findByRole('link', { name: /Receipt 1 \(PDF\)/ })
}

beforeEach(() => fetchReceiptLink.mockReset())

describe('ReceiptPreviews', () => {
  it('opens a fresh link when the first one has expired', async () => {
    fetchReceiptLink
      .mockResolvedValueOnce({ ok: true, data: { url: 'https://cdn.example/old', expiresAt: new Date(Date.now() - 1000).toISOString() } })
      .mockResolvedValueOnce({ ok: true, data: { url: 'https://cdn.example/new', expiresAt: new Date(Date.now() + 300_000).toISOString() } })
    const tab = { opener: {}, location: { href: '' }, close: jest.fn() }
    const open = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)

    fireEvent.click(await renderPreviews())

    await waitFor(() => expect(tab.location.href).toBe('https://cdn.example/new'))
    expect(tab.opener).toBeNull()
    expect(fetchReceiptLink).toHaveBeenCalledTimes(2)
    open.mockRestore()
  })

  it('opens a link still within its five minutes as it is', async () => {
    fetchReceiptLink.mockResolvedValueOnce({ ok: true, data: { url: 'https://cdn.example/fresh', expiresAt: new Date(Date.now() + 300_000).toISOString() } })
    const open = jest.spyOn(window, 'open')

    const link = await renderPreviews()
    fireEvent.click(link)

    expect(link).toHaveAttribute('href', 'https://cdn.example/fresh')
    expect(open).not.toHaveBeenCalled()
    expect(fetchReceiptLink).toHaveBeenCalledTimes(1)
    open.mockRestore()
  })
})
