/**
 * A shared-table claimant splits what the item claims LEFT. When the item
 * claims took every eligible unit there is nothing left to share, and a ₱0
 * grant with an ID on it must not reach the sales book.
 */
import { computeGovDiscount } from '@/lib/gov-discount'

describe('a shared-table claimant with nothing left to share', () => {
  it('is refused with a message for the cashier', () => {
    const result = computeGovDiscount({
      vatStatus: 'vat',
      lines: [{ key: 'line-0', name: 'Sisig', quantity: 1, amount: 560, eligible: true }],
      diners: 3,
      claimants: [
        { id: 'c1', kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345', allocation: { mode: 'items', units: { 'line-0': 1 } } },
        { id: 'c2', kind: 'pwd', name: 'Maria Santos', idNumber: '67890', allocation: { mode: 'shared' } },
      ],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toEqual([
      expect.objectContaining({ code: 'nothing_left_to_share', claimantId: 'c2' }),
    ])
  })

  it('is priced as usual when shared food is left', () => {
    const result = computeGovDiscount({
      vatStatus: 'vat',
      lines: [
        { key: 'line-0', name: 'Sisig', quantity: 1, amount: 560, eligible: true },
        { key: 'line-1', name: 'Rice', quantity: 3, amount: 150, eligible: true },
      ],
      diners: 3,
      claimants: [
        { id: 'c1', kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345', allocation: { mode: 'items', units: { 'line-0': 1 } } },
        { id: 'c2', kind: 'pwd', name: 'Maria Santos', idNumber: '67890', allocation: { mode: 'shared' } },
      ],
    })

    expect(result.ok).toBe(true)
  })
})
