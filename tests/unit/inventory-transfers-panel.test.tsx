/**
 * The screen a transfer is actually performed on.
 *
 * Two things matter more than layout here. A transfer is only checkable against
 * a physical box, so the box's contents have to be on the screen — ingredient
 * names and quantities, not a count of lines. And the buttons must match what
 * the account may do: an offered button that the service refuses teaches the
 * rule by rejection.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StockTransfersPanel } from '@/components/admin/stock-transfers-panel'
import type { TransferListItem } from '@/lib/inventory/transfers-view'
import type { BranchScope } from '@/lib/outlets/branch-scope'

const NORTH = 'o-north'
const SOUTH = 'o-south'

const BRANCHES = [
  { id: NORTH, name: 'North' },
  { id: SOUTH, name: 'South' },
]

const OWNER: BranchScope = { kind: 'all' }
const AT_NORTH: BranchScope = { kind: 'branch', outletId: NORTH }

const transfer = (over: Partial<TransferListItem> = {}): TransferListItem => ({
  id: 'xfer-1',
  status: 'draft',
  fromOutletId: NORTH,
  toOutletId: SOUTH,
  createdAt: '2026-07-30T01:00:00.000Z',
  lines: [{ inventoryItemId: 'item-flour', name: 'Flour', unit: 'g', sentQuantity: 500 }],
  ...over,
})

const props = (over: Record<string, unknown> = {}) => ({
  transfers: [transfer()],
  branches: BRANCHES,
  scope: OWNER,
  onSend: jest.fn(),
  onReceive: jest.fn(),
  onCancel: jest.fn(),
  ...over,
})

describe('StockTransfersPanel', () => {
  it('renders nothing for a single-shop store', () => {
    // A store with one branch can never transfer anything. A panel explaining
    // that on every inventory screen is noise on the majority of tenants.
    const { container } = render(
      <StockTransfersPanel {...props({ branches: [{ id: NORTH, name: 'North' }] })} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('names both ends of the transfer', () => {
    render(<StockTransfersPanel {...props()} />)

    expect(screen.getByText(/North/)).toBeInTheDocument()
    expect(screen.getByText(/South/)).toBeInTheDocument()
  })

  it('lists what is on the transfer, so it can be checked against the box', () => {
    render(<StockTransfersPanel {...props()} />)

    expect(screen.getByText(/Flour/)).toBeInTheDocument()
    expect(screen.getByText(/500/)).toBeInTheDocument()
  })

  it('shows what is in transit even when nothing is drafted', () => {
    render(<StockTransfersPanel {...props({ transfers: [transfer({ status: 'sent' })] })} />)

    expect(screen.getByText(/In transit/i)).toBeInTheDocument()
  })

  it('tells a store with branches but no transfers that there are none', () => {
    render(<StockTransfersPanel {...props({ transfers: [] })} />)

    expect(screen.getByText(/no transfers/i)).toBeInTheDocument()
  })
})

describe('StockTransfersPanel — the actions offered', () => {
  it('offers the owner a way to send a draft', async () => {
    const onSend = jest.fn()
    render(<StockTransfersPanel {...props({ onSend })} />)

    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    expect(onSend).toHaveBeenCalledWith('xfer-1')
  })

  it('offers a way to abandon a draft', async () => {
    const onCancel = jest.fn()
    render(<StockTransfersPanel {...props({ onCancel })} />)

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalledWith('xfer-1')
  })

  it('does not offer to send stock that has already gone', () => {
    render(<StockTransfersPanel {...props({ transfers: [transfer({ status: 'sent' })] })} />)

    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument()
  })

  it('offers no action to a branch that is neither end’s owner', () => {
    // North is the SOURCE of a sent transfer — only South may count it in.
    render(
      <StockTransfersPanel
        {...props({ scope: AT_NORTH, transfers: [transfer({ status: 'sent' })] })}
      />,
    )

    expect(screen.queryByRole('button', { name: /receive/i })).not.toBeInTheDocument()
  })
})

describe('StockTransfersPanel — counting a delivery in', () => {
  const sent = [transfer({ status: 'sent' })]

  it('starts the count at what was sent, so an intact load is one click', async () => {
    // The common case is that everything arrived. Starting blank would make the
    // honest path the laborious one and invite a merchant to skip the step.
    render(<StockTransfersPanel {...props({ transfers: sent })} />)

    await userEvent.click(screen.getByRole('button', { name: /receive/i }))

    expect(screen.getByLabelText(/Flour/i)).toHaveValue(500)
  })

  it('sends the counted quantities, not the sent ones', async () => {
    const onReceive = jest.fn()
    render(<StockTransfersPanel {...props({ transfers: sent, onReceive })} />)

    await userEvent.click(screen.getByRole('button', { name: /receive/i }))
    const input = screen.getByLabelText(/Flour/i)
    await userEvent.clear(input)
    await userEvent.type(input, '480')
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

    expect(onReceive).toHaveBeenCalledWith('xfer-1', { 'item-flour': 480 })
  })

  it('warns before recording a shortfall, because it books shrinkage', async () => {
    render(<StockTransfersPanel {...props({ transfers: sent })} />)

    await userEvent.click(screen.getByRole('button', { name: /receive/i }))
    const input = screen.getByLabelText(/Flour/i)
    await userEvent.clear(input)
    await userEvent.type(input, '480')

    expect(screen.getByText(/short/i)).toBeInTheDocument()
  })

  it('will not let a merchant count in more than was sent', async () => {
    const onReceive = jest.fn()
    render(<StockTransfersPanel {...props({ transfers: sent, onReceive })} />)

    await userEvent.click(screen.getByRole('button', { name: /receive/i }))
    const input = screen.getByLabelText(/Flour/i)
    await userEvent.clear(input)
    await userEvent.type(input, '600')
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

    expect(onReceive).not.toHaveBeenCalled()
  })
})

describe('StockTransfersPanel — a received transfer', () => {
  it('shows a shortfall against the transfer that recorded it', () => {
    render(
      <StockTransfersPanel
        {...props({
          transfers: [
            transfer({
              status: 'received',
              lines: [
                {
                  inventoryItemId: 'item-flour',
                  name: 'Flour',
                  unit: 'g',
                  sentQuantity: 500,
                  receivedQuantity: 480,
                },
              ],
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText(/short/i)).toBeInTheDocument()
  })
})
