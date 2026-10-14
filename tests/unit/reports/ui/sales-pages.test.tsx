/**
 * The sales report pages, rendered from fake report-function rows: every view
 * draws, the figures on screen are the rows' figures, and one failing read
 * stays inside its card. The pages' async server components are awaited here
 * and their async children resolved (`resolveAsync`), because jsdom renders
 * client trees only. jest.mock is NOT hoisted under next/jest's SWC, so the
 * components are imported lazily.
 */
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { buildReportContext, type ReportContext } from '@/lib/reports/read/report-context'
import { installDomPolyfills } from './dom-polyfills'

jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 600, height: 240 }}>
        {isValidElement(children) ? cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 600, height: 240 }) : children}
      </div>
    ),
  }
})
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/shop/admin/reports' }))
jest.mock('server-only', () => ({}))
const replies = new Map<string, { data: unknown; error: { code?: string; message: string } | null }>()
jest.mock('@/lib/reports/read/load-report-context', () => ({
  reportClient: async () => ({
    rpc: async (fn: string) => replies.get(fn) ?? { data: [], error: null },
  }),
}))
jest.mock('@/lib/boost/workspace', () => ({
  getBoostMenu: async () => ({
    items: [
      { id: 'm1', name: 'Sisig', price: 250, categoryId: null },
      { id: 'm2', name: 'Rice', price: 30, categoryId: null },
      { id: 'm3', name: 'Lechon', price: 400, categoryId: null },
    ],
  }),
}))
jest.mock('@/components/admin/boost/picked-together-section', () => ({
  PickedTogetherSection: () => <p>Picked together</p>,
  PickedTogetherSkeleton: () => null,
}))

installDomPolyfills()

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const O1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const O2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'

function context(): ReportContext {
  const state = buildReportContext({
    tenant: { id: TENANT, slug: 'shop', multiBranchEnabled: true, hasConvexDeployment: false },
    backend: 'platform',
    appUser: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null },
    outlets: [
      { id: O1, name: 'Makati', isActive: true },
      { id: O2, name: 'BGC', isActive: true },
    ],
    searchParams: { period: 'last_week' },
    now: Date.parse('2026-10-14T07:30:00Z'),
  })
  if (state.kind !== 'ready') throw new Error('context not ready')
  return state.context
}

const SUMMARY = {
  orders: 4,
  gross_cents: 130000,
  discount_cents: 10000,
  delivery_discount_cents: 0,
  refund_cents: 0,
  net_cents: 120000,
  service_cents: 6000,
  delivery_cents: 4000,
  billed_cents: 130000,
  collected_cents: 100000,
  unpaid_cents: 30000,
  overpaid_cents: 0,
  void_orders: 1,
  void_billed_cents: 25000,
  orders_without_lines: 1,
  orders_lines_mismatch: 0,
  line_gap_cents: 0,
}

const ITEMS = [
  { item_key: 'id:m1', menu_item_id: 'm1', label: 'Sisig', category_label: 'Mains', orders: 3, quantity: 30, gross_cents: 80000, discount_cents: 5000, net_cents: 75000, is_unrecorded: false },
  { item_key: 'id:m2', menu_item_id: 'm2', label: 'Rice', category_label: 'Sides', orders: 3, quantity: 40, gross_cents: 30000, discount_cents: 2000, net_cents: 28000, is_unrecorded: false },
  { item_key: 'name:old dish', menu_item_id: null, label: 'Old dish', category_label: null, orders: 1, quantity: 2, gross_cents: 10000, discount_cents: 3000, net_cents: 7000, is_unrecorded: false },
  { item_key: 'unrecorded', menu_item_id: null, label: 'Items not recorded', category_label: null, orders: 1, quantity: 0, gross_cents: 10000, discount_cents: 0, net_cents: 10000, is_unrecorded: true },
]

/** Await async server components wherever they sit in the children. */
async function resolveAsync(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveAsync))
  if (!isValidElement(node)) return node
  const element = node as ReactElement<{ children?: ReactNode }>
  if (typeof element.type === 'function' && element.type.constructor.name === 'AsyncFunction') {
    const Component = element.type as (props: unknown) => Promise<ReactNode>
    return resolveAsync(await Component(element.props))
  }
  if (element.props.children === undefined) return element
  return cloneElement(element, undefined, await resolveAsync(element.props.children))
}

async function renderServer(tree: Promise<ReactNode> | ReactNode) {
  return render(<>{await resolveAsync(await tree)}</>)
}

beforeEach(() => {
  replies.clear()
  replies.set('report_sales_summary', { data: [SUMMARY], error: null })
})

describe('Sales overview', () => {
  test('insight, four tiles, the trend and a ledger that adds up', async () => {
    replies.set('report_sales_by_period', {
      data: [{ bucket: '2026-10-09', orders: 4, gross_cents: 130000, discount_cents: 10000, net_cents: 120000, billed_cents: 130000, collected_cents: 100000 }],
      error: null,
    })
    const { SalesOverview } = await import('@/components/admin/reports/sales/sales-overview')
    await renderServer(SalesOverview({ context: context() }))

    expect(screen.getByRole('region', { name: 'In short' })).toHaveTextContent(/₱1,200/)
    for (const label of ['Net sales', 'Orders', 'Average order', 'Collected']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('₱300 still unpaid')).toBeInTheDocument()
    const totals = screen.getByRole('region', { name: 'Totals' })
    expect(totals).toHaveTextContent(/Gross sales.*₱1,300.*Discounts.*₱100.*Net sales.*₱1,200.*Total billed.*₱1,300/)
    expect(within(totals).getByText('1 order · ₱250')).toBeInTheDocument()
    // Every breakdown is offered, Branches included for this two-branch owner.
    const breakdowns = screen.getByRole('region', { name: 'Break it down' })
    expect(within(breakdowns).getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringContaining('Items'),
      expect.stringContaining('Categories'),
      expect.stringContaining('Payments'),
      expect.stringContaining('Channels'),
      expect.stringContaining('Hours'),
      expect.stringContaining('Branches'),
    ])
    expect(within(breakdowns).getAllByRole('link')[0]).toHaveAttribute('href', '/shop/admin/reports/items?period=last_week')
  })

  test('a failed trend read stays in its card; the totals still show', async () => {
    replies.set('report_sales_by_period', { data: null, error: { code: '57014', message: 'statement timeout' } })
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { SalesOverview } = await import('@/components/admin/reports/sales/sales-overview')
    await renderServer(SalesOverview({ context: context() }))
    const trend = screen.getByRole('region', { name: 'Sales over time' })
    expect(within(trend).getByTestId('report-section-error')).toHaveTextContent('couldn’t load')
    expect(screen.getByRole('region', { name: 'Totals' })).toHaveTextContent('₱1,200')
  })

  test('without the Reports key the page says so, it does not crash', async () => {
    replies.set('report_sales_summary', { data: null, error: { code: '42501', message: 'Sales reports need the Reports permission.' } })
    const { SalesOverview } = await import('@/components/admin/reports/sales/sales-overview')
    await renderServer(SalesOverview({ context: context() }))
    expect(screen.getAllByText(/Reports permission/).length).toBeGreaterThan(0)
  })
})

describe('Breakdowns', () => {
  test('Items: ranked, deleted and unrecorded dishes said plainly, coverage note above', async () => {
    replies.set('report_sales_by_item', { data: ITEMS, error: null })
    const { ItemsBreakdown } = await import('@/components/admin/reports/sales/breakdowns/items-breakdown')
    await renderServer(ItemsBreakdown({ context: context(), view: 'table' }))
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent(/Sisig.*Mains.*30.*₱750/)
    expect(table).toHaveTextContent('Not on the menu now')
    expect(table).toHaveTextContent('Orders saved without their dishes')
    // Σ items = net sales.
    expect(rows.at(-1)).toHaveTextContent(/Total.*₱1,200/)
    expect(screen.getByRole('note')).toHaveTextContent('1 order was saved without their dishes')
    expect(screen.getByText('Picked together')).toBeInTheDocument()
  })

  test('Items, Menu matrix: the quadrants from the same rows, the price caveat shown', async () => {
    replies.set('report_sales_by_item', { data: ITEMS, error: null })
    const { ItemsBreakdown } = await import('@/components/admin/reports/sales/breakdowns/items-breakdown')
    await renderServer(ItemsBreakdown({ context: context(), view: 'matrix' }))
    expect(screen.getByRole('region', { name: 'Best Seller' })).toHaveTextContent('Sisig')
    expect(screen.getByRole('region', { name: 'Popular' })).toHaveTextContent('Rice')
    expect(screen.getByRole('region', { name: 'Hidden Gem' })).toHaveTextContent('Lechon')
    expect(screen.getAllByRole('note').map((note) => note.textContent).join(' ')).toMatch(/judged by menu price/)
    expect(screen.getByRole('link', { name: 'Menu matrix' })).toHaveAttribute('aria-current', 'page')
  })

  test('Payments: one stacked bar and the methods, unpaid kept separate', async () => {
    replies.set('report_payments', {
      data: [
        { method_key: 'id:g', method_id: null, label: 'GCash', cents: 60000, orders: 2 },
        { method_key: 'id:c', method_id: null, label: 'Cash', cents: 40000, orders: 2 },
      ],
      error: null,
    })
    const { PaymentsBreakdown } = await import('@/components/admin/reports/sales/breakdowns/payments-breakdown')
    await renderServer(PaymentsBreakdown({ context: context() }))
    expect(screen.getByText('₱1,000 collected, ₱300 still unpaid.')).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows[1]).toHaveTextContent(/GCash.*₱600.*60%/)
    // A split-paid order sits under two methods: the order column has no sum.
    expect(rows.at(-1)).toHaveTextContent(/Total.*—.*₱1,000/)
  })

  test('Branches: named branches and Unassigned add up to the store', async () => {
    replies.set('report_sales_by_dimension', {
      data: [
        { key: O1, orders: 2, quantity: 10, gross_cents: 70000, discount_cents: 0, net_cents: 70000 },
        { key: null, orders: 2, quantity: 5, gross_cents: 50000, discount_cents: 0, net_cents: 50000 },
      ],
      error: null,
    })
    const { BranchesBreakdown } = await import('@/components/admin/reports/sales/breakdowns/branches-breakdown')
    await renderServer(BranchesBreakdown({ context: context() }))
    const table = screen.getByRole('table')
    expect(table).toHaveTextContent('Makati')
    expect(table).toHaveTextContent('Unassigned')
    expect(within(table).getAllByRole('row').at(-1)).toHaveTextContent(/Total.*4.*₱1,200/)
  })

  test('Hours: the heatmap and the busiest slots', async () => {
    replies.set('report_sales_by_hour', {
      data: [
        { weekday: 5, hour: 19, orders: 3, net_cents: 90000 },
        { weekday: 6, hour: 12, orders: 1, net_cents: 30000 },
      ],
      error: null,
    })
    const { HoursBreakdown } = await import('@/components/admin/reports/sales/breakdowns/hours-breakdown')
    await renderServer(HoursBreakdown({ context: context() }))
    const busiest = screen.getByRole('region', { name: 'Busiest hours' })
    expect(within(busiest).getAllByRole('listitem')[0]).toHaveTextContent(/Friday 7 PM.*3 orders.*₱900/)
  })

  test('Channels and Categories render their tables', async () => {
    replies.set('report_sales_by_dimension', {
      data: [{ key: 'pos', orders: 4, quantity: 10, gross_cents: 130000, discount_cents: 10000, net_cents: 120000 }],
      error: null,
    })
    replies.set('report_sales_by_category', {
      data: [{ category_key: 'name:mains', label: 'Mains', orders: 3, quantity: 30, gross_cents: 130000, discount_cents: 10000, net_cents: 120000, from_current_menu: true }],
      error: null,
    })
    const { ChannelsBreakdown } = await import('@/components/admin/reports/sales/breakdowns/channels-breakdown')
    const { CategoriesBreakdown } = await import('@/components/admin/reports/sales/breakdowns/categories-breakdown')
    const channels = await renderServer(ChannelsBreakdown({ context: context() }))
    expect(screen.getAllByRole('table')[0]).toHaveTextContent('Counter (POS)')
    channels.unmount()
    await renderServer(CategoriesBreakdown({ context: context() }))
    expect(screen.getByRole('table')).toHaveTextContent('Partly filed by today’s menu')
  })
})

describe('review fixes', () => {
  test('Picked together (whole store, 90 days) is not shown beside one branch’s figures', async () => {
    replies.set('report_sales_by_item', { data: ITEMS, error: null })
    const { ItemsBreakdown } = await import('@/components/admin/reports/sales/breakdowns/items-breakdown')
    const base = context()
    const oneBranch = { ...base, branch: { branch: O1, args: { p_outlet: O1, p_unassigned: false } } }
    await renderServer(ItemsBreakdown({ context: oneBranch, view: 'table' }))
    expect(screen.queryByText('Picked together')).not.toBeInTheDocument()
  })

  test('a failed menu read stays in the matrix card', async () => {
    replies.set('report_sales_by_item', { data: ITEMS, error: null })
    const workspace = jest.requireMock('@/lib/boost/workspace') as { getBoostMenu: () => Promise<unknown> }
    const original = workspace.getBoostMenu
    workspace.getBoostMenu = async () => {
      throw new Error('menu read timed out')
    }
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { ItemsBreakdown } = await import('@/components/admin/reports/sales/breakdowns/items-breakdown')
      await renderServer(ItemsBreakdown({ context: context(), view: 'matrix' }))
      expect(screen.getByTestId('report-section-error')).toHaveTextContent('couldn’t load')
      expect(screen.getByRole('link', { name: 'Ranked list' })).toBeInTheDocument()
    } finally {
      workspace.getBoostMenu = original
    }
  })
})

describe('accessibility (axe, structure rules; contrast needs a real browser)', () => {
  async function violations(container: HTMLElement) {
    const axe = jest.requireActual('axe-core') as typeof import('axe-core')
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)
  }

  test('the overview has no violations', async () => {
    replies.set('report_sales_by_period', { data: [], error: null })
    const { SalesOverview } = await import('@/components/admin/reports/sales/sales-overview')
    const { container } = await renderServer(SalesOverview({ context: context() }))
    expect(await violations(container)).toEqual([])
  })

  test('the items table and the matrix have no violations', async () => {
    replies.set('report_sales_by_item', { data: ITEMS, error: null })
    const { ItemsBreakdown } = await import('@/components/admin/reports/sales/breakdowns/items-breakdown')
    const table = await renderServer(ItemsBreakdown({ context: context(), view: 'table' }))
    expect(await violations(table.container)).toEqual([])
    table.unmount()
    const matrix = await renderServer(ItemsBreakdown({ context: context(), view: 'matrix' }))
    expect(await violations(matrix.container)).toEqual([])
  })
})
