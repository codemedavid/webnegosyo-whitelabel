/**
 * Superadmin tenant list — URL-addressable search.
 *
 * The search box used to live only in component state, so a reload or the
 * back button lost the filter. It now reads ?q= on mount and writes the
 * debounced value back with router.replace so the URL is the source of truth.
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const replace = jest.fn()
let currentQuery = ''

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/superadmin/tenants',
  useSearchParams: () => new URLSearchParams(currentQuery),
}))

const fetchTenants = jest.fn()
jest.mock('@/app/actions/tenants', () => ({
  fetchTenants: (...args: unknown[]) => fetchTenants(...args),
  fetchTenantMetrics: jest.fn(async () => ({})),
}))

jest.mock('@/actions/tenants', () => ({
  bulkSetTenantsActiveAction: jest.fn(),
  bulkDeleteTenantsAction: jest.fn(),
}))

jest.mock('@/lib/queries/tenants', () => ({
  useDeleteTenant: () => ({ mutateAsync: jest.fn() }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

import { TenantManager } from '@/components/superadmin/tenant-manager'

const DEBOUNCE_MS = 300

function renderManager() {
  return render(
    <TenantManager initialTenants={[]} initialCount={0} initialMetrics={{}} />,
  )
}

describe('TenantManager URL-addressable search', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    replace.mockClear()
    fetchTenants.mockReset()
    fetchTenants.mockResolvedValue({ data: [], count: 0 })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('initialises the search box from ?q= and searches with it', async () => {
    currentQuery = 'q=seacook'

    renderManager()

    const input = screen.getByLabelText('Search tenants') as HTMLInputElement
    expect(input.value).toBe('seacook')
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchTenants).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'seacook' }),
    )
  })

  test('uses a plain text input so WebKit does not draw a second clear button', async () => {
    currentQuery = ''

    renderManager()

    const input = screen.getByLabelText('Search tenants') as HTMLInputElement
    expect(input.type).toBe('text')
    await act(async () => { await Promise.resolve() })
  })

  test('writes the debounced search to the URL with router.replace', async () => {
    currentQuery = ''
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    renderManager()
    await user.type(screen.getByLabelText('Search tenants'), 'sea cook')
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_MS + 1)
    })

    expect(replace).toHaveBeenLastCalledWith(
      '/superadmin/tenants?q=sea%20cook',
      { scroll: false },
    )
  })

  test('clears ?q= from the URL when the search is emptied', async () => {
    currentQuery = 'q=seacook'
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    renderManager()
    await user.click(screen.getByLabelText('Clear search'))
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_MS + 1)
    })

    expect(replace).toHaveBeenLastCalledWith('/superadmin/tenants', {
      scroll: false,
    })
  })
})
