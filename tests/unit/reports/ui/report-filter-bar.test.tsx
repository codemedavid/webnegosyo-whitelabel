/**
 * ReportFilterBar. next/navigation is mocked; jest.mock is NOT hoisted under
 * next/jest's SWC transform, so the component is imported lazily per test.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installDomPolyfills, setWideScreen } from './dom-polyfills'
import type { ReportFilterValue } from '@/components/admin/reports/report-filter-bar'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

installDomPolyfills()

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'custom', label: 'Custom' },
]
const BASE: ReportFilterValue = { preset: 'this_week', from: null, to: null, branch: null, compare: true }

function buildHref(next: ReportFilterValue): string {
  const params = new URLSearchParams()
  params.set('period', next.preset)
  if (next.from) params.set('from', next.from)
  if (next.to) params.set('to', next.to)
  if (next.branch) params.set('branch', next.branch)
  if (!next.compare) params.set('compare', '0')
  return `/r?${params.toString()}`
}

async function renderBar(overrides: Partial<React.ComponentProps<typeof import('@/components/admin/reports/report-filter-bar').ReportFilterBar>> = {}) {
  const { ReportFilterBar } = await import('@/components/admin/reports/report-filter-bar')
  return render(
    <ReportFilterBar
      presets={PRESETS}
      value={BASE}
      buildHref={buildHref}
      maxDays={92}
      today="2026-10-14"
      {...overrides}
    />,
  )
}

const lastHref = () => mockPush.mock.calls.at(-1)?.[0]

beforeEach(() => {
  mockPush.mockClear()
  setWideScreen(true)
})

describe('ReportFilterBar', () => {
  it('pushes the preset into the URL, clearing custom dates', async () => {
    const user = userEvent.setup()
    await renderBar({ value: { ...BASE, preset: 'custom', from: '2026-10-01', to: '2026-10-05' } })
    await user.click(screen.getByRole('combobox', { name: 'Period' }))
    await user.click(await screen.findByRole('option', { name: 'Last week' }))
    expect(lastHref()).toBe('/r?period=last_week')
  })

  it('shows a custom range as dates on the period button', async () => {
    await renderBar({ value: { ...BASE, preset: 'custom', from: '2026-10-01', to: '2026-10-05' } })
    expect(screen.getByRole('combobox', { name: 'Period' })).toHaveTextContent('Oct 1 – Oct 5')
  })

  it('custom: does not navigate on pick, validates inline, applies a valid range', async () => {
    const user = userEvent.setup()
    await renderBar()
    await user.click(screen.getByRole('combobox', { name: 'Period' }))
    await user.click(await screen.findByRole('option', { name: 'Custom' }))
    expect(mockPush).not.toHaveBeenCalled()

    const inline = screen.getByTestId('report-filters-inline')
    const from = within(inline).getByLabelText('From')
    const to = within(inline).getByLabelText('To')
    const apply = within(inline).getByRole('button', { name: 'Apply dates' })

    await user.clear(from)
    await user.type(from, '2026-10-10')
    await user.clear(to)
    await user.type(to, '2026-10-05')
    await user.click(apply)
    expect(within(inline).getByRole('alert')).toHaveTextContent('The start date must be on or before the end date.')
    expect(to).toHaveAttribute('aria-invalid', 'true')

    await user.clear(to)
    await user.type(to, '2026-10-20')
    await user.click(apply)
    expect(within(inline).getByRole('alert')).toHaveTextContent("The end date can't be after today.")

    await user.clear(from)
    await user.type(from, '2026-01-01')
    await user.clear(to)
    await user.type(to, '2026-10-14')
    await user.click(apply)
    expect(within(inline).getByRole('alert')).toHaveTextContent('Pick 92 days or fewer')
    expect(mockPush).not.toHaveBeenCalled()

    await user.clear(from)
    await user.type(from, '2026-10-01')
    await user.click(apply)
    expect(lastHref()).toBe('/r?period=custom&from=2026-10-01&to=2026-10-14')
  })

  it('changes branch, and "All branches" clears it', async () => {
    const user = userEvent.setup()
    const branches = [
      { value: 'b1', label: 'Makati' },
      { value: 'unassigned', label: 'Unassigned' },
    ]
    const { rerender } = await renderBar({ branches })
    await user.click(screen.getByRole('combobox', { name: 'Branch' }))
    await user.click(await screen.findByRole('option', { name: 'Unassigned' }))
    expect(lastHref()).toBe('/r?period=this_week&branch=unassigned')

    const { ReportFilterBar } = await import('@/components/admin/reports/report-filter-bar')
    rerender(
      <ReportFilterBar
        presets={PRESETS}
        value={{ ...BASE, branch: 'b1' }}
        branches={branches}
        buildHref={buildHref}
        maxDays={92}
        today="2026-10-14"
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Branch' }))
    await user.click(await screen.findByRole('option', { name: 'All branches' }))
    expect(lastHref()).toBe('/r?period=this_week')
  })

  it('has no branch control without branches', async () => {
    await renderBar({ branches: null })
    expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument()
  })

  it('toggles compare', async () => {
    const user = userEvent.setup()
    await renderBar()
    const compare = screen.getByRole('switch', { name: 'Compare' })
    expect(compare).toBeChecked()
    await user.click(compare)
    expect(lastHref()).toBe('/r?period=this_week&compare=0')
  })

  it('a branch account sees a locked chip, not a picker', async () => {
    await renderBar({ isBranchLocked: true, lockedBranchLabel: 'Makati', branches: [{ value: 'b1', label: 'Makati' }] })
    expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument()
    expect(screen.getByText(/Your branch · Makati/)).toHaveTextContent('Your branch · Makati (locked)')
  })

  it('on a phone: Filters · N opens a sheet holding the rest, and Custom opens it directly', async () => {
    const user = userEvent.setup()
    setWideScreen(false)
    await renderBar({ value: { ...BASE, branch: 'b1', compare: false }, branches: [{ value: 'b1', label: 'Makati' }] })

    await user.click(screen.getByRole('button', { name: 'Filters · 2' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(sheet).getByRole('combobox', { name: 'Branch' })).toHaveTextContent('Makati')
    expect(within(sheet).getByRole('switch', { name: 'Compare' })).not.toBeChecked()
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Period' }))
    await user.click(await screen.findByRole('option', { name: 'Custom' }))
    const customSheet = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(customSheet).getByRole('group', { name: 'Custom dates' })).toBeInTheDocument()
    await user.click(within(customSheet).getByRole('button', { name: 'Apply dates' }))
    expect(lastHref()).toBe('/r?period=custom&from=2026-10-14&to=2026-10-14&branch=b1&compare=0')
  })
})
