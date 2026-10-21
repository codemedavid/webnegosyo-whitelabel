/**
 * The Profit page, rendered from fake profit-function rows: the sentence adds
 * up, a loss says so in words and an icon, the trust strip links to the fix,
 * the cash flow view shows purchases, one failing read stays in its card, and
 * an account without Expenses + Costs sees the locked message, not figures.
 * jest.mock is NOT hoisted under next/jest's SWC, so modules load lazily.
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
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/shop/admin/reports/profit', notFound: jest.fn() }))
jest.mock('server-only', () => ({}))
type Reply = { data: unknown; error: { code?: string; message: string } | null }
const replies = new Map<string, Reply | ((args: Record<string, unknown>) => Reply)>()
const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
jest.mock('@/lib/reports/read/load-report-context', () => ({
  reportClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      const reply = replies.get(fn) ?? { data: [], error: null }
      return typeof reply === 'function' ? reply(args) : reply
    },
  }),
  loadReportPage: async () => ({ kind: 'ready', context: currentContext }),
}))
let caller: { appUser: unknown; roleError: unknown } = { appUser: null, roleError: null }
jest.mock('@/lib/auth/request-caller', () => ({ getRequestCaller: async () => caller }))

installDomPolyfills()

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const OWNER = { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null }
let currentContext: ReportContext

function context(searchParams: Record<string, string> = { period: 'this_month' }): ReportContext {
  const state = buildReportContext({
    tenant: { id: TENANT, slug: 'shop', multiBranchEnabled: false, hasConvexDeployment: false },
    backend: 'platform',
    appUser: OWNER,
    outlets: [],
    searchParams,
    now: Date.parse('2026-10-21T04:00:00Z'),
  })
  if (state.kind !== 'ready') throw new Error('context not ready')
  return state.context
}

const SUMMARY = {
  orders: 120,
  net_sales_cents: 18_240_000,
  collected_cents: 17_000_000,
  sale_movements: 300,
  ledger_cogs_cents: 6_000_000,
  fallback_cogs_cents: 200_000,
  fallback_orders: 4,
  waste_cents: 150_000,
  count_variance_cents: 60_000,
  uncosted_movements: 0,
  sold_quantity: 100,
  costed_quantity: 92,
  sold_dishes: 31,
  costed_dishes: 22,
  dish_costs_visible: true,
  ingredients_cents: 900_000,
  ingredient_stock_cents: 800_000,
  staff_cents: 1_480_000,
  occupancy_cents: 0,
  utilities_cents: 857_000,
  operating_cents: 296_000,
  admin_cents: 0,
  other_cents: 1_208_000,
  capex_cents: 2_500_000,
  not_expense_cents: 1_000_000,
  expense_count: 18,
  store_wide_expense_cents: 0,
  unsorted_payouts: 2,
  unsorted_payout_cents: 24_000,
}

const category = (id: string, name: string, group: string, cents: number, systemKey: string | null = null) => ({
  category_id: id,
  name,
  icon: name.slice(0, 2).toUpperCase(),
  category_group: group,
  system_key: systemKey,
  cents,
  stock_purchase_cents: 0,
  expenses: 1,
})

const CURRENT = [
  category('c-wages', 'Salaries & wages (Sahod)', 'staff', 1_480_000, 'wages'),
  category('c-power', 'Electricity (Kuryente)', 'utilities', 482_000, 'electricity'),
  category('c-lpg', 'Gas / LPG', 'utilities', 375_000, 'lpg'),
  category('c-delivery', 'Delivery & rider fees', 'operating', 296_000),
  category('c-other', 'Other', 'other', 1_208_000, 'other'),
  category('c-ing', 'Ingredients (Palengke)', 'ingredients', 900_000, 'ingredients'),
]
const PREVIOUS = [...CURRENT, category('c-rent', 'Rent (Upa)', 'occupancy', 1_500_000, 'rent')]

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

const renderServer = async (tree: Promise<ReactNode> | ReactNode) => render(<>{await resolveAsync(await tree)}</>)

beforeEach(() => {
  replies.clear()
  calls.length = 0
  currentContext = context()
  caller = { appUser: OWNER, roleError: null }
  replies.set('report_profit_summary', { data: [SUMMARY], error: null })
  // This month's categories, or last month's (read with an earlier p_from).
  const thisMonth = new Date(currentContext.period.start).toISOString()
  replies.set('report_expenses_by_category', (args) => ({ data: args.p_from === thisMonth ? CURRENT : PREVIOUS, error: null }))
  replies.set('report_profit_by_period', {
    data: [
      { bucket: '2026-10-05', orders: 60, net_sales_cents: 9_000_000, collected_cents: 8_500_000, sale_movements: 150, ledger_cogs_cents: 3_000_000, fallback_cogs_cents: 100_000, waste_cents: 75_000, count_variance_cents: 30_000, ingredient_direct_cents: 50_000, ingredient_stock_cents: 400_000, expenses_cents: 1_900_000, cash_out_cents: 4_000_000 },
    ],
    error: null,
  })
})

async function renderOverview(view: 'profit' | 'cash' = 'profit') {
  const { ProfitOverview } = await import('@/components/admin/reports/profit/profit-overview')
  return renderServer(ProfitOverview({ context: currentContext, view }))
}

describe('Profit overview', () => {
  test('the sentence adds up: Sales − Ingredients − Expenses = Profit', async () => {
    await renderOverview()
    const card = screen.getByRole('region', { name: 'Profit' })
    // Ingredients = 60,000 + 2,000 recipes + 2,100 losses + 1,000 not stocked = ₱65,100.
    expect(within(card).getByText('Sales (Benta)').closest('div')).toHaveTextContent('₱182,400')
    expect(within(card).getByText('Ingredients (Sangkap)').closest('div')?.parentElement).toHaveTextContent('₱65,100')
    expect(within(card).getByText('Expenses (Gastos)').closest('div')).toHaveTextContent('₱38,410')
    expect(card).toHaveTextContent('₱78,890')
    expect(card).toHaveTextContent('43% of sales')
    expect(card).toHaveTextContent('Not in profit: big purchases ₱25,000 · owner took cash, deposits & loans ₱10,000')
  })

  test('the trust strip names what is missing and links to the fix', async () => {
    await renderOverview()
    const strip = screen.getByRole('list', { name: 'Before you trust this number' })
    expect(strip).toHaveTextContent('No Rent (Upa) recorded this month yet. Profit looks higher than it is.')
    expect(within(strip).getByRole('link', { name: /Record/ })).toHaveAttribute('href', '/shop/admin/expenses?add=c-rent')
    expect(within(strip).getByRole('link', { name: /Sort/ })).toHaveAttribute('href', '/shop/admin/expenses?view=unsorted')
  })

  test('prime cost against the 55–65% band, ratios, and where the money went (largest first, no ingredients)', async () => {
    await renderOverview()
    expect(screen.getByRole('meter', { name: 'Ingredients and staff as a share of sales' })).toHaveAttribute('aria-valuenow', '44')
    const list = screen.getByRole('region', { name: 'Where the money went' })
    const names = within(list)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(names[0]).toMatch(/^SASalaries & wages \(Sahod\)₱14,800$/)
    expect(names.some((name) => name?.includes('Ingredients'))).toBe(false)
  })

  test('a loss is red with an icon and the word, never colour alone', async () => {
    replies.set('report_profit_summary', { data: [{ ...SUMMARY, other_cents: 20_000_000 }], error: null })
    await renderOverview()
    const card = screen.getByRole('region', { name: 'Profit' })
    expect(card).toHaveTextContent(/Lugi \(loss\) · −₱/)
  })

  test('the cash flow view shows stock purchases and owner draws, and reads no trend', async () => {
    await renderOverview('cash')
    expect(screen.getByText('Money in (collected)').parentElement).toHaveTextContent('₱170,000')
    expect(screen.getByText('Stock purchases').parentElement).toHaveTextContent('₱8,000')
    expect(screen.getByText('Not expenses (owner took cash, deposits, loans)').parentElement).toHaveTextContent('₱10,000')
    expect(calls.some((call) => call.fn === 'report_profit_by_period')).toBe(false)
  })

  test('a failing summary stays inside its card', async () => {
    replies.set('report_profit_summary', { data: null, error: { code: '42501', message: 'nope' } })
    await renderOverview()
    expect(screen.getByTestId('report-section-error')).toHaveTextContent('Ask the owner for cost access to see profit.')
  })
})

describe('Profit page access', () => {
  test('without Expenses and Costs the page shows the locked message, and reads nothing', async () => {
    caller = { appUser: { ...OWNER, is_owner: false, permissions: ['reports', 'expenses'] }, roleError: null }
    const { default: ProfitPage } = await import('@/app/[tenant]/admin/reports/profit/page')
    await renderServer(ProfitPage({ params: Promise.resolve({ tenant: 'shop' }), searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Ask the owner for cost access to see profit.')).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  test('an account read that failed is locked out (fail closed)', async () => {
    caller = { appUser: OWNER, roleError: new Error('timeout') }
    const { default: ProfitPage } = await import('@/app/[tenant]/admin/reports/profit/page')
    await renderServer(ProfitPage({ params: Promise.resolve({ tenant: 'shop' }), searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Ask the owner for cost access to see profit.')).toBeInTheDocument()
  })

  test('the owner gets the Profit and Cash flow tabs, keeping the period', async () => {
    const { default: ProfitPage } = await import('@/app/[tenant]/admin/reports/profit/page')
    await renderServer(ProfitPage({ params: Promise.resolve({ tenant: 'shop' }), searchParams: Promise.resolve({ period: 'this_month' }) }))
    const tabs = screen.getByRole('navigation', { name: 'Profit views' })
    expect(within(tabs).getByRole('link', { name: 'Cash flow' })).toHaveAttribute('href', '/shop/admin/reports/profit?period=this_month&view=cash')
  })
})
