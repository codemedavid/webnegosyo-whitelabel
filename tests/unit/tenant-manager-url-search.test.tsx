/**
 * Superadmin restaurant list — search behaviour.
 *
 * The search used to (1) write ?q= with router.replace, which re-rendered the
 * whole force-dynamic page (platform overview + Convex fan-out) on every pause
 * in typing, (2) refetch the server-rendered page on mount, and (3) hold the
 * rows back until the per-tenant order metrics finished. These pin the fixes.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Tenant } from '@/types/database'

const routerReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/superadmin/tenants',
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/actions/tenants', () => ({
  bulkSetTenantsActiveAction: jest.fn(),
  bulkDeleteTenantsAction: jest.fn(),
}))

jest.mock('@/lib/queries/tenants', () => ({
  useDeleteTenant: () => ({ mutate: jest.fn() }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

const SEACOOK_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

function tenant(id: string, name: string, slug: string): Tenant {
  return {
    id,
    name,
    slug,
    is_active: true,
    primary_color: '#000000',
    domain: null,
    created_at: '2026-09-01T00:00:00.000Z',
    logo_url: null,
    menu_engineering_enabled: false,
    bundles_enabled: false,
    lalamove_enabled: false,
    app_enabled: false,
  } as unknown as Tenant
}

const SEACOOK = tenant(SEACOOK_ID, 'SeaCook', 'seacook')
const OTHER = tenant(OTHER_ID, 'Other Grill', 'other-grill')

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response
}

function metricsFor(ids: string[]) {
  return Object.fromEntries(
    ids.map((id) => [
      id,
      { tenantId: id, orders30d: 7, ordersLifetime: 9, gmvLifetime: 1000, lastOrderAt: null },
    ]),
  )
}

type Handler = (url: URL) => Promise<Response>
let listHandler: Handler
let metricsHandler: Handler
const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  if (url.pathname === '/api/superadmin/tenants/metrics') return metricsHandler(url)
  if (url.pathname === '/api/superadmin/tenants') return listHandler(url)
  throw new Error(`unexpected fetch ${url}`)
})

function listCalls(): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname === '/api/superadmin/tenants')
}

async function renderManager(props: {
  initialTenants?: Tenant[]
  initialCount?: number
  initialSearch?: string
}) {
  // Imported lazily: next/jest's SWC transform does not hoist jest.mock above
  // static imports.
  const { TenantManager } = await import('@/components/superadmin/tenant-manager')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  const initialTenants = props.initialTenants ?? []
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantManager
        initialTenants={initialTenants}
        initialCount={props.initialCount ?? initialTenants.length}
        initialSearch={props.initialSearch ?? ''}
      />
    </QueryClientProvider>,
  )
}

describe('TenantManager search', () => {
  beforeEach(() => {
    fetchMock.mockClear()
    routerReplace.mockClear()
    global.fetch = fetchMock as unknown as typeof fetch
    window.history.replaceState(null, '', '/superadmin/tenants')
    listHandler = async () =>
      jsonResponse({ success: true, data: { tenants: [SEACOOK], count: 1 }, error: null })
    metricsHandler = async (url) =>
      jsonResponse({
        success: true,
        data: metricsFor(url.searchParams.get('ids')!.split(',')),
        error: null,
      })
  })

  test('uses a plain text input so WebKit does not draw a second clear button', async () => {
    await renderManager({})
    const input = screen.getByLabelText('Search tenants') as HTMLInputElement
    expect(input.type).toBe('text')
  })

  test('starts from the server-rendered search without refetching the list', async () => {
    window.history.replaceState(null, '', '/superadmin/tenants?q=seacook')

    await renderManager({ initialTenants: [SEACOOK], initialSearch: 'seacook' })

    expect((screen.getByLabelText('Search tenants') as HTMLInputElement).value).toBe('seacook')
    // Metrics are the only request on mount.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(listCalls()).toHaveLength(0)
  })

  test('shows rows before their metrics arrive, then fills the metrics in', async () => {
    let releaseMetrics: () => void = () => {}
    metricsHandler = (url) =>
      new Promise((resolve) => {
        releaseMetrics = () =>
          resolve(
            jsonResponse({
              success: true,
              data: metricsFor(url.searchParams.get('ids')!.split(',')),
              error: null,
            }),
          )
      })

    await renderManager({ initialTenants: [SEACOOK] })

    expect(screen.getAllByText('SeaCook').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Loading order stats').length).toBeGreaterThan(0)

    releaseMetrics()
    await waitFor(() => expect(screen.getAllByText(/7 orders/).length).toBeGreaterThan(0))
  })

  test('searches through the GET route and mirrors ?q= without a navigation', async () => {
    const user = userEvent.setup()
    await renderManager({ initialTenants: [SEACOOK, OTHER] })

    await user.type(screen.getByLabelText('Search tenants'), 'sea cook')

    await waitFor(() => expect(listCalls()).toHaveLength(1))
    expect(listCalls()[0].searchParams.get('q')).toBe('sea cook')
    expect(window.location.search).toBe('?q=sea+cook')
    expect(routerReplace).not.toHaveBeenCalled()
  })

  test('does not refetch metrics for rows it has already seen', async () => {
    const user = userEvent.setup()
    await renderManager({ initialTenants: [SEACOOK, OTHER] })
    await waitFor(() => expect(screen.getAllByText(/7 orders/).length).toBeGreaterThan(0))
    const metricsCallsBefore = fetchMock.mock.calls.length - listCalls().length

    await user.type(screen.getByLabelText('Search tenants'), 'sea')
    await waitFor(() => expect(listCalls()).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText('Other Grill')).toBeNull())

    const metricsCallsAfter = fetchMock.mock.calls.length - listCalls().length
    expect(metricsCallsAfter).toBe(metricsCallsBefore)
  })

  test('clears ?q= from the URL when the search is emptied', async () => {
    window.history.replaceState(null, '', '/superadmin/tenants?q=seacook')
    const user = userEvent.setup()
    await renderManager({ initialTenants: [SEACOOK], initialSearch: 'seacook' })

    await user.click(screen.getByLabelText('Clear search'))

    await waitFor(() => expect(window.location.search).toBe(''))
  })

  test('shows a retryable error instead of an empty list when the search fails', async () => {
    listHandler = async () =>
      jsonResponse({ success: false, data: null, error: 'Could not load restaurants' }, 502)
    const user = userEvent.setup()
    await renderManager({ initialTenants: [SEACOOK] })

    await user.type(screen.getByLabelText('Search tenants'), 'x')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load restaurants')
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
