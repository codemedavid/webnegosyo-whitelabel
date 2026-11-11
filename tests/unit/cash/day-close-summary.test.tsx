/**
 * The day close as it reads on screen and on paper: the cash to deposit
 * first, named shifts when the store has them, and no false ₱0 when sales
 * are masked or kept elsewhere.
 */
import { render, screen } from '@testing-library/react'
import { DayCloseSummary } from '@/components/admin/cash/day-close-summary'
import { parseDayCloseSnapshot } from '@/lib/cash/day-close'
import { SNAPSHOT } from '../../fixtures/day-close-snapshot'

describe('DayCloseSummary', () => {
  it('leads with the cash to deposit, then sales, named shifts and recounts', () => {
    render(<DayCloseSummary snapshot={parseDayCloseSnapshot(SNAPSHOT)} isDrawersOnly={false} />)

    expect(screen.getByText('Cash to deposit')).toBeInTheDocument()
    expect(screen.getByText('₱19,850.00')).toBeInTheDocument()
    expect(screen.getByText('Day shift')).toBeInTheDocument()
    expect(screen.getByText('Other hours')).toBeInTheDocument()
    expect(screen.getByText('Counted twice')).toBeInTheDocument()
    expect(screen.getAllByText(/Short ₱120.00/).length).toBeGreaterThan(0)
  })

  it('says why sales are missing instead of showing ₱0', () => {
    const { rerender } = render(<DayCloseSummary snapshot={parseDayCloseSnapshot({ ...SNAPSHOT, sales: null })} isDrawersOnly />)
    expect(screen.getByText(/covers the drawers only/)).toBeInTheDocument()

    rerender(<DayCloseSummary snapshot={parseDayCloseSnapshot({ ...SNAPSHOT, sales: null })} isDrawersOnly={false} />)
    expect(screen.getByText(/need the Reports permission/)).toBeInTheDocument()
    expect(screen.queryByText('Net sales')).not.toBeInTheDocument()
  })

  it('shows "—" for an unknown cash to deposit', () => {
    render(<DayCloseSummary snapshot={parseDayCloseSnapshot({ ...SNAPSHOT, cashToAccountForCents: null })} isDrawersOnly={false} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
