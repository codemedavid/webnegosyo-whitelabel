/**
 * On a phone the item page's fixed "Add to cart" bar covered the note box's
 * counter at the fold (browser QA 2026-11-04). Focusing the box brings the
 * whole field, counter included, to the middle of the screen.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { ItemNoteField } from '@/components/customer/item-note-field'

const COLORS = { title: '#111', muted: '#666', text: '#111', background: '#fff', border: '#ddd', focus: '#f60' }

describe('ItemNoteField — focus', () => {
  const original = Element.prototype.scrollIntoView
  afterEach(() => {
    Element.prototype.scrollIntoView = original
  })

  it('scrolls the field and its counter into the middle of the screen', () => {
    const scrollIntoView = jest.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<ItemNoteField value="" onChange={jest.fn()} colors={COLORS} />)

    fireEvent.focus(screen.getByRole('textbox'))

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }))
    const scrolled = scrollIntoView.mock.contexts[0] as HTMLElement
    expect(scrolled).toContainElement(screen.getByText(/^0\/\d+$/))
  })

  it('does not throw where scrollIntoView is missing', () => {
    // @ts-expect-error — some embedded browsers lack it.
    delete Element.prototype.scrollIntoView
    render(<ItemNoteField value="" onChange={jest.fn()} colors={COLORS} />)

    expect(() => fireEvent.focus(screen.getByRole('textbox'))).not.toThrow()
  })
})
