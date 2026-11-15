/**
 * "My formats" on the Export page and "Save to My formats" on Owl's card:
 * a format's links carry its own spec and the page's dates, a format this
 * account cannot run offers no download, removing takes two taps, and the
 * card's Save posts exactly what the card carried.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { FileCardView } from '@/components/admin/assistant/file-card'
import { MyFormats } from '@/components/admin/reports/export/my-formats'
import { customReportSpecSchema } from '@/lib/exports/custom-report'
import { reportFormatSpecSchema } from '@/lib/exports/report-format'
import type { TemplateCard } from '@/lib/exports/report-templates'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const spec = customReportSpecSchema.parse({ title: 'Average order per day', sheet: 'sales_by_day', columns: [{ id: 'day' }, { id: 'aov', header: 'Avg ticket' }] })

function card(overrides: Partial<TemplateCard> = {}): TemplateCard {
  return { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Weekly owner report', summary: 'Sales by day · Day, Avg ticket', savedBy: 'Ana', kind: 'custom', sheets: ['sales_by_day'], isDetail: false, lockedNote: null, ...overrides }
}

const page = { tenantId: TENANT, period: { preset: 'custom' as const, from: '2026-11-02', to: '2026-11-08' }, periodFrom: '2026-11-02', periodTo: '2026-11-08', branch: null, periodError: null }

const fetchMock = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) })
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('MyFormats', () => {
  it('shows nothing when the store has saved none', () => {
    const { container } = render(<MyFormats {...page} formats={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('links each format to the export route by its id, with the page’s dates', () => {
    render(<MyFormats {...page} formats={[card()]} />)
    expect(screen.getByRole('heading', { name: 'My formats' })).toBeInTheDocument()
    expect(screen.getByText('Saved by Ana')).toBeInTheDocument()
    const href = screen.getByRole('link', { name: 'Excel' }).getAttribute('href') ?? ''
    const query = new URLSearchParams(href.split('?')[1])
    expect(href.startsWith('/api/exports?')).toBe(true)
    expect(Object.fromEntries(query)).toMatchObject({ tenantId: TENANT, sheets: 'sales_by_day', period: 'custom', from: '2026-11-02', to: '2026-11-08', format: 'xlsx', source: 'page' })
    // The link names the format; its shape stays on the server.
    expect(query.get('template')).toBe('bbbbbbbb-0000-4000-8000-000000000001')
    expect(query.has('custom')).toBe(false)
    expect(new URLSearchParams((screen.getByRole('link', { name: 'CSV' }).getAttribute('href') ?? '').split('?')[1]).get('format')).toBe('csv')
  })

  it('offers no download for a format this account cannot run, or dates too long for it, and says why', () => {
    const locked = card({ id: 'bbbbbbbb-0000-4000-8000-000000000002', name: 'Costs', lockedNote: 'Not on your account: it uses a column your account does not have access to.' })
    const detail = card({ id: 'bbbbbbbb-0000-4000-8000-000000000003', name: 'GCash orders', sheets: ['orders'], isDetail: true })
    render(<MyFormats {...page} period={{ preset: 'custom', from: '2026-07-01', to: '2026-11-08' }} periodFrom="2026-07-01" periodTo="2026-11-08" formats={[locked, detail]} />)
    expect(screen.queryByRole('link', { name: 'Excel' })).not.toBeInTheDocument()
    expect(screen.getByText(/uses a column your account does not have access to/)).toBeInTheDocument()
    expect(screen.getByText(/GCash orders lists every row, so one file covers up to 93 days. You picked 131/)).toBeInTheDocument()
  })

  it('previews a format through the same route, by its id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          preview: {
            header: { storeName: 'Shop', periodLabel: '2026-11-02 to 2026-11-08', branchLabel: 'Whole store', asOf: 'now' },
            leftOut: [],
            sheets: [{ id: 'sales_by_day', name: 'Average order per day', rowIs: 'one business day', columns: ['Day', 'Avg ticket'], kinds: ['text', 'money'], rows: 1, peek: [['2026-11-03', 420]], notes: [] }],
          },
        }),
    })
    render(<MyFormats {...page} formats={[card()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('₱420.00')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/exports')
    expect(JSON.parse(init.body)).toEqual({ tenantId: TENANT, mode: 'preview', sheets: ['sales_by_day'], period: page.period, branch: null, template: 'bbbbbbbb-0000-4000-8000-000000000001' })
  })

  it('removes a format only after a second tap, then reads the page again', async () => {
    render(<MyFormats {...page} formats={[card()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Weekly owner report' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/removes the saved format for everyone in the store/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/exports/formats')
    expect(JSON.parse(init.body)).toEqual({ action: 'remove', tenantId: TENANT, id: 'bbbbbbbb-0000-4000-8000-000000000001' })
  })

  it('keeps the format and says why when the removal was refused', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ success: false, error: 'That format is already gone, or this account may not remove it.' }) })
    render(<MyFormats {...page} formats={[card()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Weekly owner report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    expect(await screen.findByText(/already gone, or this account may not remove it/)).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})

describe('Save to My formats on Owl’s file card', () => {
  const fileCard = {
    type: 'file' as const,
    title: 'Average order per day',
    subtitle: '2026-11-02 to 2026-11-08 · Whole store',
    sheets: [{ name: 'Average order per day', rows: 6 }],
    notes: [],
    downloads: [{ label: 'Download Excel', href: `/api/exports?tenantId=${TENANT}&sheets=sales_by_day&period=today&format=xlsx&source=owl` }],
  }

  it('is offered only on a card that carries a report to keep', () => {
    const { rerender } = render(<FileCardView card={fileCard} />)
    expect(screen.queryByRole('button', { name: 'Save to My formats' })).not.toBeInTheDocument()
    rerender(<FileCardView card={{ ...fileCard, save: { tenantId: TENANT, name: 'Average order per day', spec } }} />)
    expect(screen.getByRole('button', { name: 'Save to My formats' })).toBeInTheDocument()
  })

  it('posts what the card carried and says where the format went', async () => {
    render(<FileCardView card={{ ...fileCard, save: { tenantId: TENANT, name: 'Average order per day', spec } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to My formats' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved as “Average order per day”. Find it under My formats on the Export page.')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/exports/formats')
    expect(JSON.parse(init.body)).toEqual({ action: 'save', tenantId: TENANT, name: 'Average order per day', spec })
    expect(screen.queryByRole('button', { name: 'Save to My formats' })).not.toBeInTheDocument()
    // An Export page open behind the chat reads its list again.
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows the server’s sentence when the name is taken, and lets the owner try again', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ success: false, error: 'You already have a format called “Average order per day”. Remove it first, or save this one under another name.' }) })
    render(<FileCardView card={{ ...fileCard, save: { tenantId: TENANT, name: 'Average order per day', spec } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to My formats' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already have a format called/)
    expect(within(document.body).getByRole('button', { name: 'Save to My formats' })).toBeEnabled()
  })

  describe('a layout Owl matched from the owner’s own spreadsheet', () => {
    const FORMAT_ID = 'bbbbbbbb-0000-4000-8000-000000000009'
    const layout = reportFormatSpecSchema.parse({ tabs: [{ title: 'Benta', sheet: 'sales_by_day', columns: [{ header: 'Petsa', id: 'day' }, { header: 'Upa', id: null }] }] })
    const matched = {
      ...fileCard,
      title: 'Monthly para kay Ate',
      sheets: [{ name: 'Benta', rows: 14 }],
      notes: ['Benta: one row is a day.', '  Petsa → Day', '  Upa → left blank (no figure for this)'],
      downloads: [],
      save: { tenantId: TENANT, name: 'Monthly para kay Ate', kind: 'format' as const, spec: layout, sheets: ['sales_by_day'], period: { from: '2026-11-01', to: '2026-11-14' } },
    }

    it('shows the matching and a Save, and no file until it is saved', () => {
      render(<FileCardView card={matched} />)
      expect(screen.getByText(/Upa → left blank/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save this format' })).toBeInTheDocument()
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('saves it under its own action, then offers the file for the dates it was matched with, by the format’s id', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, format: { id: FORMAT_ID, name: 'Monthly para kay Ate' } }) })
      render(<FileCardView card={matched} />)
      fireEvent.click(screen.getByRole('button', { name: 'Save this format' }))
      const excel = await screen.findByRole('link', { name: 'Download Excel' })
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'save_format', tenantId: TENANT, name: 'Monthly para kay Ate', spec: layout })
      const query = new URLSearchParams((excel.getAttribute('href') ?? '').split('?')[1])
      expect(Object.fromEntries(query)).toEqual({ tenantId: TENANT, sheets: 'sales_by_day', period: 'custom', from: '2026-11-01', to: '2026-11-14', format: 'xlsx', source: 'owl', template: FORMAT_ID })
      expect(screen.getByRole('link', { name: 'CSV' }).getAttribute('href')).toContain('format=csv')
    })

    it('offers no file when the stored card’s sheets or dates are not what they should be, or the server sent no id', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, format: { id: FORMAT_ID } }) })
      const { unmount } = render(<FileCardView card={{ ...matched, save: { ...matched.save, sheets: ['payroll'], period: { from: 'soon', to: '2026-11-14' } } }} />)
      fireEvent.click(screen.getByRole('button', { name: 'Save this format' }))
      expect(await screen.findByRole('status')).toHaveTextContent(/Saved as “Monthly para kay Ate”/)
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      unmount()
      fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) })
      render(<FileCardView card={matched} />)
      fireEvent.click(screen.getByRole('button', { name: 'Save this format' }))
      expect(await screen.findByRole('status')).toBeInTheDocument()
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('renders nothing for a card with neither a file nor something to save', () => {
      const { container } = render(<FileCardView card={{ ...matched, save: undefined }} />)
      expect(container).toBeEmptyDOMElement()
    })
  })
})
