/**
 * The client half of the transfers route: drafting a transfer, and handing the
 * lifecycle actions to the server.
 *
 * The panel already covers send/receive/cancel. What is left — and what this
 * pins — is the one form that starts a transfer, plus the rule that makes it
 * safe: a merchant may only draft OUT of a branch they may actually send from.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransfersWorkbench } from '@/components/admin/transfers-workbench'
import { indexStockRows } from '@/lib/inventory/stock-location'
import type { BranchScope } from '@/lib/outlets/branch-scope'

const NORTH = 'o-north'
const SOUTH = 'o-south'
const FLOUR = 'item-flour'

const BRANCHES = [
  { id: NORTH, name: 'North' },
  { id: SOUTH, name: 'South' },
]

const INGREDIENTS = [
  { id: FLOUR, name: 'Flour', unit: 'g' },
  { id: 'item-sugar', name: 'Sugar', unit: 'g' },
]

const OWNER: BranchScope = { kind: 'all' }
const AT_NORTH: BranchScope = { kind: 'branch', outletId: NORTH }

const createAction = jest.fn()
const sendAction = jest.fn()
const receiveAction = jest.fn()
const cancelAction = jest.fn()

jest.mock('@/app/actions/inventory-transfers', () => ({
  createStockTransferAction: (...a: unknown[]) => createAction(...a),
  sendStockTransferAction: (...a: unknown[]) => sendAction(...a),
  receiveStockTransferAction: (...a: unknown[]) => receiveAction(...a),
  cancelStockTransferAction: (...a: unknown[]) => cancelAction(...a),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

/** North holds 500 flour and 300 sugar; South holds 200 flour and no sugar. */
const STOCK = indexStockRows([
  { inventory_item_id: FLOUR, outlet_id: NORTH, current_qty: 500, reorder_level: 0 },
  { inventory_item_id: 'item-sugar', outlet_id: NORTH, current_qty: 300, reorder_level: 0 },
  { inventory_item_id: FLOUR, outlet_id: SOUTH, current_qty: 200, reorder_level: 0 },
])

const props = (over: Record<string, unknown> = {}) => ({
  tenantId: 'tenant-1',
  tenantSlug: 'demo',
  transfers: [],
  branches: BRANCHES,
  ingredients: INGREDIENTS,
  stockIndex: STOCK,
  scope: OWNER as BranchScope,
  ...over,
})

beforeEach(() => {
  createAction.mockReset().mockResolvedValue({ success: true, data: { id: 'xfer-1' } })
  sendAction.mockReset().mockResolvedValue({ success: true })
  receiveAction.mockReset().mockResolvedValue({ success: true })
  cancelAction.mockReset().mockResolvedValue({ success: true })
})

describe('TransfersWorkbench — drafting', () => {
  it('creates a transfer from the chosen branches and ingredient', async () => {
    render(<TransfersWorkbench {...props()} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), NORTH)
    await userEvent.selectOptions(screen.getByLabelText(/^to$/i), SOUTH)
    await userEvent.selectOptions(screen.getByLabelText(/ingredient/i), FLOUR)
    await userEvent.type(screen.getByLabelText(/quantity/i), '500')
    await userEvent.click(screen.getByRole('button', { name: /add to transfer/i }))
    await userEvent.click(screen.getByRole('button', { name: /create transfer/i }))

    expect(createAction).toHaveBeenCalledWith(
      'tenant-1',
      'demo',
      expect.objectContaining({
        fromOutletId: NORTH,
        toOutletId: SOUTH,
        lines: [{ inventoryItemId: FLOUR, quantity: 500 }],
      }),
    )
  })

  it('will not create a transfer with nothing on it', async () => {
    render(<TransfersWorkbench {...props()} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), NORTH)
    await userEvent.selectOptions(screen.getByLabelText(/^to$/i), SOUTH)
    await userEvent.click(screen.getByRole('button', { name: /create transfer/i }))

    expect(createAction).not.toHaveBeenCalled()
  })

  it('will not send stock to the branch it came from', async () => {
    // The schema refuses it and so does the CHECK constraint. Refusing it here
    // too means the merchant is told before they have filled the whole form.
    render(<TransfersWorkbench {...props()} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), NORTH)
    await userEvent.selectOptions(screen.getByLabelText(/^to$/i), NORTH)

    expect(screen.getByRole('button', { name: /create transfer/i })).toBeDisabled()
  })

  it('offers a branch manager only their own branch as the source', () => {
    // Not a security boundary — the service re-checks. It is what stops a
    // manager composing a transfer they will only be refused at the end of.
    render(<TransfersWorkbench {...props({ scope: AT_NORTH })} />)

    const source = screen.getByLabelText(/^from$/i)

    expect(source).toHaveValue(NORTH)
    expect(source).toBeDisabled()
  })

  it('lets an owner send out of the unbranched store pool', () => {
    render(<TransfersWorkbench {...props()} />)

    expect(
      within(screen.getByLabelText(/^from$/i)).getByRole('option', { name: /store pool/i }),
    ).toBeInTheDocument()
  })
})

describe('TransfersWorkbench — the lifecycle', () => {
  const draft = {
    id: 'xfer-1',
    status: 'draft' as const,
    fromOutletId: NORTH,
    toOutletId: SOUTH,
    createdAt: '2026-07-30T01:00:00.000Z',
    lines: [{ inventoryItemId: FLOUR, name: 'Flour', unit: 'g', sentQuantity: 500 }],
  }

  it('sends a drafted transfer', async () => {
    render(<TransfersWorkbench {...props({ transfers: [draft] })} />)

    await userEvent.click(screen.getByRole('button', { name: /^send$/i }))

    expect(sendAction).toHaveBeenCalledWith('tenant-1', 'demo', 'xfer-1')
  })

  it('records a delivery with the counted quantities', async () => {
    render(<TransfersWorkbench {...props({ transfers: [{ ...draft, status: 'sent' }] })} />)

    await userEvent.click(screen.getByRole('button', { name: /receive/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

    expect(receiveAction).toHaveBeenCalledWith('tenant-1', 'demo', 'xfer-1', { [FLOUR]: 500 })
  })

  it('surfaces a refusal rather than silently doing nothing', async () => {
    const { toast } = jest.requireMock('sonner')
    sendAction.mockResolvedValue({ success: false, error: 'You can only move stock in and out of your own branch' })

    render(<TransfersWorkbench {...props({ transfers: [draft] })} />)
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }))

    expect(toast.error).toHaveBeenCalledWith(
      'You can only move stock in and out of your own branch',
    )
  })
})

describe('TransfersWorkbench — what the source branch can actually send', () => {
  it('offers only the ingredients the source branch is holding', async () => {
    // South holds flour and no sugar. Offering sugar leads to a draft the
    // ledger will refuse at send, after the merchant has composed the whole
    // transfer.
    render(<TransfersWorkbench {...props()} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), SOUTH)

    const picker = screen.getByLabelText(/ingredient/i)
    expect(within(picker).getByRole('option', { name: /flour/i })).toBeInTheDocument()
    expect(within(picker).queryByRole('option', { name: /sugar/i })).not.toBeInTheDocument()
  })

  it('re-offers the list when the source branch changes', async () => {
    render(<TransfersWorkbench {...props()} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), SOUTH)
    expect(
      within(screen.getByLabelText(/ingredient/i)).queryByRole('option', { name: /sugar/i }),
    ).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), NORTH)
    expect(
      within(screen.getByLabelText(/ingredient/i)).getByRole('option', { name: /sugar/i }),
    ).toBeInTheDocument()
  })

  it('says what the source branch is holding of the chosen ingredient', async () => {
    // The merchant is deciding how much to send. The branch's own figure is
    // the one that governs, and it is not the number the inventory table shows.
    render(<TransfersWorkbench {...props()} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), SOUTH)
    await userEvent.selectOptions(screen.getByLabelText(/ingredient/i), FLOUR)

    expect(screen.getByText(/200 g/i)).toBeInTheDocument()
  })

  it('refuses a line for more than the branch holds, before the transfer exists', async () => {
    render(<TransfersWorkbench {...props()} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), SOUTH)
    await userEvent.selectOptions(screen.getByLabelText(/^to$/i), NORTH)
    await userEvent.selectOptions(screen.getByLabelText(/ingredient/i), FLOUR)
    await userEvent.type(screen.getByLabelText(/quantity/i), '900')
    await userEvent.click(screen.getByRole('button', { name: /add to transfer/i }))
    await userEvent.click(screen.getByRole('button', { name: /create transfer/i }))

    expect(createAction).not.toHaveBeenCalled()
  })

  it('names the ingredient it cannot send that much of', async () => {
    // "Something is too big" makes the merchant re-check every row they typed.
    render(<TransfersWorkbench {...props()} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), SOUTH)
    await userEvent.selectOptions(screen.getByLabelText(/^to$/i), NORTH)
    await userEvent.selectOptions(screen.getByLabelText(/ingredient/i), FLOUR)
    await userEvent.type(screen.getByLabelText(/quantity/i), '900')
    await userEvent.click(screen.getByRole('button', { name: /add to transfer/i }))

    expect(screen.getByText(/flour/i, { selector: 'p' })).toBeInTheDocument()
  })

  it('still creates a transfer that empties the shelf exactly', async () => {
    // Sending everything is a real thing to do, and an off-by-one here would
    // block the branch handing its stock to the shop still trading.
    render(<TransfersWorkbench {...props()} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), SOUTH)
    await userEvent.selectOptions(screen.getByLabelText(/^to$/i), NORTH)
    await userEvent.selectOptions(screen.getByLabelText(/ingredient/i), FLOUR)
    await userEvent.type(screen.getByLabelText(/quantity/i), '200')
    await userEvent.click(screen.getByRole('button', { name: /add to transfer/i }))
    await userEvent.click(screen.getByRole('button', { name: /create transfer/i }))

    expect(createAction).toHaveBeenCalled()
  })

  it('explains an empty picker rather than showing a blank control', async () => {
    // A branch holding nothing has nothing to send. An empty dropdown reads as
    // a broken screen.
    render(<TransfersWorkbench {...props({ branches: [...BRANCHES, { id: 'o-new', name: 'New' }] })} />)

    await userEvent.selectOptions(screen.getByLabelText(/^from$/i), 'o-new')

    expect(screen.getByText(/nothing.*to send|no stock/i)).toBeInTheDocument()
  })
})
