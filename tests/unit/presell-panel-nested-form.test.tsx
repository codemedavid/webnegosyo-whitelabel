/**
 * The presell panel renders INSIDE the menu item editor's `<form>`.
 *
 * It used to render forms of its own, and a submit event bubbles: clicking
 * "Add date" also ran the editor's `onSubmit`, which saved the whole dish and
 * navigated back to the menu list — the merchant saw the page refresh and the
 * date never landed. `<Button>` has no default `type`, so a bare one added
 * here is a submit button and would reproduce it.
 *
 * These tests mount the panel inside a form, the way the editor does, and
 * hold it to never submitting its parent and never reaching the server.
 */

import { render, screen, fireEvent, within } from '@testing-library/react'
import { useState } from 'react'
import { PresellStockPanel } from '@/components/admin/presell-stock-panel'
import type { DraftAllocation } from '@/lib/presell/allocation-draft'

const presellActions = jest.fn()
jest.mock('@/app/actions/presell', () => new Proxy({}, { get: () => presellActions }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const entry = (presellDate: string, stockQty: number, soldQty = 0): DraftAllocation => ({
  presellDate,
  stockQty,
  soldQty,
})

const TODAY = '2026-12-18'
const SAVED = [entry('2026-12-20', 20, 3)]

/** The shape the menu item editor puts the panel in. */
function renderInsideEditorForm(onOuterSubmit: jest.Mock, saved: DraftAllocation[] = SAVED) {
  function Host() {
    const [draft, setDraft] = useState<DraftAllocation[]>(saved)
    return (
      <form onSubmit={onOuterSubmit}>
        <PresellStockPanel
          savedAllocations={saved}
          draft={draft}
          onDraftChange={setDraft}
          todayKey={TODAY}
        />
        <button type="submit">Update Menu Item</button>
      </form>
    )
  }
  return render(<Host />)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('PresellStockPanel inside the editor form', () => {
  it('renders no form of its own', () => {
    // Arrange & Act
    const { container } = renderInsideEditorForm(jest.fn())

    // Assert — the outer editor form, and nothing nested inside it.
    expect(container.querySelectorAll('form')).toHaveLength(1)
  })

  it('gives every button an explicit type, so none of them submits the dish', () => {
    // Arrange & Act — open the range helper and select a day so every
    // control the panel can render is on screen at once.
    const { container } = renderInsideEditorForm(jest.fn())
    fireEvent.click(screen.getByRole('button', { name: /Add several dates/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Dec 21, not offered/ }))

    // Assert — the editor's own submit button is the only one.
    const submitButtons = [...container.querySelectorAll('button')].filter(
      (button) => button.getAttribute('type') !== 'button',
    )
    expect(submitButtons.map((button) => button.textContent)).toEqual(['Update Menu Item'])
  })

  it('does not submit the dish when a date is added', () => {
    // Arrange
    const onOuterSubmit = jest.fn()
    renderInsideEditorForm(onOuterSubmit)

    // Act
    fireEvent.click(screen.getByRole('button', { name: /^Dec 21, not offered/ }))
    fireEvent.change(screen.getByLabelText('Stock for Mon, Dec 21'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: /Add date/ }))

    // Assert — the date landed in the draft (its own row in the list, plus
    // the stepper in the selected-day box) without the dish being submitted.
    expect(onOuterSubmit).not.toHaveBeenCalled()
    const list = screen.getByRole('list', { name: 'Upcoming dates' })
    expect(within(list).getByText('Mon, Dec 21')).toBeInTheDocument()
  })

  it('does not submit the dish when Enter is pressed in the stock field', () => {
    // Arrange
    const onOuterSubmit = jest.fn()
    renderInsideEditorForm(onOuterSubmit)

    // Act
    fireEvent.click(screen.getByRole('button', { name: /^Dec 21, not offered/ }))
    const input = screen.getByLabelText('Stock for Mon, Dec 21')
    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    // Assert
    expect(onOuterSubmit).not.toHaveBeenCalled()
  })

  it('does not submit the dish when a range is applied', () => {
    // Arrange
    const onOuterSubmit = jest.fn()
    renderInsideEditorForm(onOuterSubmit)
    fireEvent.click(screen.getByRole('button', { name: /Add several dates/ }))

    // Act
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-21' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-25' } })
    fireEvent.change(screen.getByLabelText('Stock per date'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Apply to 5 dates/ }))

    // Assert
    expect(onOuterSubmit).not.toHaveBeenCalled()
  })

  it('writes nothing while the merchant is still editing', () => {
    // Arrange
    renderInsideEditorForm(jest.fn())

    // Act — add a date, step one, and open the range helper.
    fireEvent.click(screen.getByLabelText('Increase stock for Sun, Dec 20'))
    fireEvent.click(screen.getByRole('button', { name: /^Dec 21, not offered/ }))
    fireEvent.change(screen.getByLabelText('Stock for Mon, Dec 21'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /Add date/ }))

    // Assert — the dish's own save is the only thing that writes.
    expect(presellActions).not.toHaveBeenCalled()
  })
})
