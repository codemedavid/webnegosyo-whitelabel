/**
 * The merchant's per-date allocation panel: a calendar to pick dates on, a
 * list of the dates already promised with a stepper each, the header totals,
 * and a range helper that fills several dates with one figure.
 *
 * The panel is fully controlled — every edit is reported up as a new draft
 * and nothing is written until the dish is saved — so these tests assert on
 * the draft it hands back, and that it never talks to the server itself.
 */

import { render, screen, fireEvent, within } from '@testing-library/react'
import { useState } from 'react'
import { PresellStockPanel } from '@/components/admin/presell-stock-panel'
import type { DraftAllocation } from '@/lib/presell/allocation-draft'

const presellActions = jest.fn()
jest.mock('@/app/actions/presell', () => new Proxy({}, { get: () => presellActions }))

const toast = { error: jest.fn(), success: jest.fn() }
jest.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toast.error(...a), success: (...a: unknown[]) => toast.success(...a) },
}))

const entry = (presellDate: string, stockQty: number, soldQty = 0): DraftAllocation => ({
  presellDate,
  stockQty,
  soldQty,
})

const TODAY = '2026-12-18'
const SAVED: DraftAllocation[] = [
  entry('2026-12-20', 20, 3),
  entry('2026-12-24', 8, 6),
  entry('2026-12-25', 10, 10),
]

/** The panel inside a host that owns the draft, the way the editor does. */
function renderPanel(saved: DraftAllocation[] = SAVED) {
  const onDraftChange = jest.fn()

  function Host() {
    const [draft, setDraft] = useState<DraftAllocation[]>(saved)
    return (
      <PresellStockPanel
        savedAllocations={saved}
        draft={draft}
        onDraftChange={(next) => {
          onDraftChange(next)
          setDraft(next)
        }}
        todayKey={TODAY}
      />
    )
  }

  render(<Host />)
  return { onDraftChange }
}

/** The draft as of the most recent change the panel reported. */
const latestDraft = (onDraftChange: jest.Mock): DraftAllocation[] =>
  onDraftChange.mock.calls.at(-1)?.[0] ?? []

beforeEach(() => {
  jest.clearAllMocks()
})

describe('PresellStockPanel', () => {
  it('summarises the upcoming dates in its header', () => {
    // Arrange & Act
    renderPanel()
    const summary = screen.getByRole('group', { name: 'Pre-order summary' })

    // Assert — 3 dates, 38 offered, 19 sold, 19 left.
    expect(within(summary).getByText('3')).toBeInTheDocument()
    expect(within(summary).getByText('38')).toBeInTheDocument()
    expect(within(summary).getAllByText('19')).toHaveLength(2)
  })

  it('never reaches the server on its own', () => {
    // Arrange
    const { onDraftChange } = renderPanel()

    // Act — step a date's stock up.
    fireEvent.click(screen.getByLabelText('Increase stock for Sun, Dec 20'))

    // Assert
    expect(onDraftChange).toHaveBeenCalled()
    expect(presellActions).not.toHaveBeenCalled()
  })

  it('offers a date the merchant picks on the calendar', () => {
    // Arrange
    const { onDraftChange } = renderPanel()

    // Act
    fireEvent.click(screen.getByRole('button', { name: /^Dec 21, not offered/ }))
    fireEvent.change(screen.getByLabelText('Stock for Mon, Dec 21'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /Add date/ }))

    // Assert
    expect(latestDraft(onDraftChange)).toContainEqual(entry('2026-12-21', 12))
  })

  it('steps a date’s stock without touching its sold count', () => {
    // Arrange
    const { onDraftChange } = renderPanel()

    // Act
    fireEvent.click(screen.getByLabelText('Increase stock for Sun, Dec 20'))

    // Assert
    expect(latestDraft(onDraftChange)).toContainEqual(entry('2026-12-20', 21, 3))
  })

  it('will not let a date fall below what already sold', () => {
    // Arrange — 24 Dec has 8 offered and 6 sold.
    const { onDraftChange } = renderPanel()
    const stock = screen.getByLabelText('Stock for Thu, Dec 24')

    // Act
    fireEvent.change(stock, { target: { value: '2' } })
    fireEvent.blur(stock)

    // Assert
    expect(latestDraft(onDraftChange)).toContainEqual(entry('2026-12-24', 6, 6))
  })

  it('fills a whole range from one figure, in one change', () => {
    // Arrange
    const { onDraftChange } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /Add several dates/ }))

    // Act
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-26' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-30' } })
    fireEvent.change(screen.getByLabelText('Stock per date'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: /Apply to 5 dates/ }))

    // Assert
    expect(onDraftChange).toHaveBeenCalledTimes(1)
    expect(latestDraft(onDraftChange)).toContainEqual(entry('2026-12-30', 7))
    expect(latestDraft(onDraftChange)).toHaveLength(SAVED.length + 5)
  })

  it('removes an unsold date from the draft', () => {
    // Arrange — 26 Dec is added first so it has no sales.
    const saved = [...SAVED, entry('2026-12-26', 4)]
    const { onDraftChange } = renderPanel(saved)

    // Act
    fireEvent.click(screen.getByLabelText('Remove Sat, Dec 26'))

    // Assert
    expect(latestDraft(onDraftChange).map((e) => e.presellDate)).not.toContain('2026-12-26')
  })

  it('refuses to remove a date that already has orders, and says why', () => {
    // Arrange
    const { onDraftChange } = renderPanel()

    // Act
    fireEvent.click(screen.getByLabelText('Remove Sun, Dec 20'))

    // Assert
    expect(onDraftChange).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/already has orders/i))
  })

  it('warns that staged dates are not saved yet', () => {
    // Arrange
    renderPanel()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // Act
    fireEvent.click(screen.getByLabelText('Increase stock for Sun, Dec 20'))

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/Unsaved date changes/i)
  })

  it('invites the merchant to start when no dates are offered', () => {
    // Arrange & Act
    renderPanel([])

    // Assert
    expect(screen.getByText('No dates offered yet')).toBeInTheDocument()
  })
})
