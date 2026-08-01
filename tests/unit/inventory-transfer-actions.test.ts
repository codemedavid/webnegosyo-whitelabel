/**
 * The server actions a transfer screen calls.
 *
 * These are the boundary between a browser and the stock ledger, so the things
 * worth pinning are the boundary's own duties: that untrusted input is validated
 * here rather than trusted onward, that a refusal comes back as a message a
 * merchant can read instead of an unhandled throw, and that the tenant is taken
 * from the server's own argument rather than from anything the client composed.
 */

import {
  createStockTransferAction,
  sendStockTransferAction,
  receiveStockTransferAction,
  cancelStockTransferAction,
} from '@/app/actions/inventory-transfers'

const TENANT = 'tenant-1'
const SLUG = 'demo'
const NORTH = 'o-north'
const SOUTH = 'o-south'
const FLOUR = 'item-flour'

const createTransfer = jest.fn()
const sendTransfer = jest.fn()
const receiveTransfer = jest.fn()
const cancelTransfer = jest.fn()

jest.mock('@/lib/inventory/stock-transfers-service', () => ({
  createTransfer: (...a: unknown[]) => createTransfer(...a),
  sendTransfer: (...a: unknown[]) => sendTransfer(...a),
  receiveTransfer: (...a: unknown[]) => receiveTransfer(...a),
  cancelTransfer: (...a: unknown[]) => cancelTransfer(...a),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const draft = {
  fromOutletId: NORTH,
  toOutletId: SOUTH,
  lines: [{ inventoryItemId: FLOUR, quantity: 10 }],
}

beforeEach(() => {
  createTransfer.mockReset().mockResolvedValue({ id: 'xfer-1' })
  sendTransfer.mockReset().mockResolvedValue(undefined)
  receiveTransfer.mockReset().mockResolvedValue(undefined)
  cancelTransfer.mockReset().mockResolvedValue(undefined)
})

describe('createStockTransferAction', () => {
  it('creates the transfer and reports its id', async () => {
    const result = await createStockTransferAction(TENANT, SLUG, draft)

    expect(result).toEqual({ success: true, data: { id: 'xfer-1' } })
    expect(createTransfer).toHaveBeenCalledWith(TENANT, expect.objectContaining({ lines: draft.lines }))
  })

  it('refuses a transfer with no ingredients on it', async () => {
    const result = await createStockTransferAction(TENANT, SLUG, { ...draft, lines: [] })

    expect(result.success).toBe(false)
    expect(createTransfer).not.toHaveBeenCalled()
  })

  it('refuses a quantity that is not a positive number', async () => {
    // Validated here rather than trusted onward: this is where untrusted input
    // arrives, and a zero-quantity line would write a ledger leg that moves
    // nothing while claiming a transfer happened.
    const result = await createStockTransferAction(TENANT, SLUG, {
      ...draft,
      lines: [{ inventoryItemId: FLOUR, quantity: 0 }],
    })

    expect(result.success).toBe(false)
    expect(createTransfer).not.toHaveBeenCalled()
  })

  it('returns the service’s refusal as a message rather than throwing', async () => {
    createTransfer.mockRejectedValue(new Error('You can only move stock in and out of your own branch'))

    const result = await createStockTransferAction(TENANT, SLUG, draft)

    expect(result).toEqual({ success: false, error: 'You can only move stock in and out of your own branch' })
  })
})

describe('sendStockTransferAction', () => {
  it('sends the transfer', async () => {
    const result = await sendStockTransferAction(TENANT, SLUG, 'xfer-1')

    expect(result).toEqual({ success: true })
    expect(sendTransfer).toHaveBeenCalledWith(TENANT, 'xfer-1')
  })

  it('reports a refusal instead of throwing', async () => {
    sendTransfer.mockRejectedValue(new Error('This transfer has already been sent'))

    const result = await sendStockTransferAction(TENANT, SLUG, 'xfer-1')

    expect(result).toEqual({ success: false, error: 'This transfer has already been sent' })
  })
})

describe('receiveStockTransferAction', () => {
  it('passes the counted quantities through as counted', async () => {
    const result = await receiveStockTransferAction(TENANT, SLUG, 'xfer-1', { [FLOUR]: 8 })

    expect(result).toEqual({ success: true })
    expect(receiveTransfer).toHaveBeenCalledWith(TENANT, 'xfer-1', { [FLOUR]: 8 })
  })

  it('refuses a negative count', async () => {
    const result = await receiveStockTransferAction(TENANT, SLUG, 'xfer-1', { [FLOUR]: -1 })

    expect(result.success).toBe(false)
    expect(receiveTransfer).not.toHaveBeenCalled()
  })

  it('accepts a count of zero — a load that never arrived', async () => {
    // The only way to close a lost load, since sent → cancelled is impossible.
    const result = await receiveStockTransferAction(TENANT, SLUG, 'xfer-1', { [FLOUR]: 0 })

    expect(result).toEqual({ success: true })
  })

  it('reports an over-receive as a message', async () => {
    receiveTransfer.mockRejectedValue(new Error('You cannot receive more than was sent'))

    const result = await receiveStockTransferAction(TENANT, SLUG, 'xfer-1', { [FLOUR]: 99 })

    expect(result).toEqual({ success: false, error: 'You cannot receive more than was sent' })
  })
})

describe('cancelStockTransferAction', () => {
  it('cancels a draft', async () => {
    const result = await cancelStockTransferAction(TENANT, SLUG, 'xfer-1')

    expect(result).toEqual({ success: true })
    expect(cancelTransfer).toHaveBeenCalledWith(TENANT, 'xfer-1')
  })

  it('reports a refusal to cancel stock that has already left', async () => {
    cancelTransfer.mockRejectedValue(new Error('A sent transfer cannot be cancelled'))

    const result = await cancelStockTransferAction(TENANT, SLUG, 'xfer-1')

    expect(result.success).toBe(false)
  })
})
