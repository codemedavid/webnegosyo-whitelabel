import { render, screen } from '@testing-library/react'
import { DashboardNotes } from '@/components/admin/dashboard/dashboard-notes'

describe('DashboardNotes', () => {
  test('renders nothing without notes', () => {
    const { container } = render(<DashboardNotes notes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('says a caveat raised by two reads only once', () => {
    render(<DashboardNotes notes={['Some orders were skipped.', 'Loyalty is unavailable.', 'Some orders were skipped.']} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Some orders were skipped.',
      'Loyalty is unavailable.',
    ])
  })
})
