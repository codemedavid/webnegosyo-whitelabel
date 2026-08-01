/**
 * The panel a merchant taps to start and finish a stock count.
 *
 * Everything the count session computes has been correct and invisible: the
 * schema, the judgement, the service and the actions all exist and nothing
 * renders them, so in production `inventory_count_id` is written by nobody.
 * This is the surface that makes the feature real.
 *
 * The two behaviours that matter most are not the buttons. They are that
 * finishing a count early must SAY what it leaves unaccounted for, and that a
 * failure to start must not look like a count that started.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StockCountPanel } from '@/components/admin/stock-count-panel'
import type { CountSessionProgress } from '@/lib/inventory/count-session'

const openStockCountAction = jest.fn()
const closeStockCountAction = jest.fn()

jest.mock('@/app/actions/inventory-counts', () => ({
  openStockCountAction: (...a: unknown[]) => openStockCountAction(...a),
  closeStockCountAction: (...a: unknown[]) => closeStockCountAction(...a),
}))

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const TENANT = 'tenant-1'
const SLUG = 'demo'

function running(overrides: Partial<CountSessionProgress> = {}): CountSessionProgress {
  return {
    state: 'open',
    countedCount: 12,
    expectedCount: 40,
    coveragePercent: 30,
    isShelfAccountedFor: false,
    ...overrides,
  }
}

function renderPanel(
  props: { countId?: string | null; progress?: CountSessionProgress | null } = {},
) {
  return render(
    <StockCountPanel
      tenantId={TENANT}
      tenantSlug={SLUG}
      outletId={null}
      countId={props.countId ?? null}
      progress={props.progress ?? null}
    />,
  )
}

beforeEach(() => {
  openStockCountAction.mockReset().mockResolvedValue({ success: true, data: { id: 'count-1' } })
  closeStockCountAction.mockReset().mockResolvedValue({ success: true })
  refresh.mockReset()
})

describe('when no count is running', () => {
  it('offers to start one', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: /start stock count/i })).toBeInTheDocument()
  })

  it('starts the count on the shelf being viewed', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /start stock count/i }))

    expect(openStockCountAction).toHaveBeenCalledWith(TENANT, SLUG, { outletId: null })
  })

  it('refreshes so the merchant’s next entry lands in the new count', async () => {
    // Without this the page still believes no count is running, and every
    // stocktake the merchant makes next is filed as a one-off.
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /start stock count/i }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('says so when the count could not be started', async () => {
    // A silent failure here is the worst outcome on this panel: the merchant
    // counts the whole shop believing it is being recorded.
    openStockCountAction.mockResolvedValue({
      success: false,
      error: 'You can only move stock at your own branch',
    })
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /start stock count/i }))

    expect(
      await screen.findByText(/you can only move stock at your own branch/i),
    ).toBeInTheDocument()
  })
})

describe('while a count is running', () => {
  it('shows how far it has got, in ingredients', () => {
    renderPanel({ countId: 'count-1', progress: running() })

    expect(screen.getByTestId('stock-count-progress')).toHaveTextContent(/12 of 40/)
  })

  it('names how many are still to count', () => {
    renderPanel({ countId: 'count-1', progress: running() })

    expect(screen.getByTestId('stock-count-detail')).toHaveTextContent(/28/)
  })

  it('warns what finishing early leaves behind, before it is finished', async () => {
    // THE POINT OF THE PANEL. After the count closes, the report can only
    // describe what happened; this is the last moment the merchant can change
    // the outcome.
    renderPanel({ countId: 'count-1', progress: running() })

    expect(screen.getByTestId('stock-count-warning')).toHaveTextContent(/28/)
  })

  it('does not warn once every ingredient has been reached', () => {
    renderPanel({
      countId: 'count-1',
      progress: running({ countedCount: 40, coveragePercent: 100 }),
    })

    expect(screen.queryByTestId('stock-count-warning')).not.toBeInTheDocument()
  })

  it('finishes the count', async () => {
    const user = userEvent.setup()
    renderPanel({ countId: 'count-1', progress: running() })

    await user.click(screen.getByRole('button', { name: /finish count/i }))

    expect(closeStockCountAction).toHaveBeenCalledWith(TENANT, SLUG, 'count-1')
  })

  it('says so when the count could not be closed', async () => {
    closeStockCountAction.mockResolvedValue({
      success: false,
      error: 'That stock count is already closed',
    })
    const user = userEvent.setup()
    renderPanel({ countId: 'count-1', progress: running() })

    await user.click(screen.getByRole('button', { name: /finish count/i }))

    expect(await screen.findByText(/already closed/i)).toBeInTheDocument()
  })
})
