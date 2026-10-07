import { render, screen } from '@testing-library/react'
import { AdminLayoutClient } from '@/components/admin/admin-layout-client'
import type { AdminShellTenant } from '@/lib/admin-shell-tenant'

const mockUsePathname = jest.fn<string, []>()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => mockUsePathname(),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/components/shared/sidebar', () => ({
  Sidebar: () => <nav data-testid="admin-sidebar" />,
  MobileSidebar: () => <div data-testid="mobile-sidebar" />,
  adminSidebarItems: [],
}))

const tenant = { name: 'SeaCook' } as unknown as AdminShellTenant

function renderLayout() {
  return render(
    <AdminLayoutClient tenantSlug="seacook" tenant={tenant}>
      <div data-testid="page-content">page</div>
    </AdminLayoutClient>
  )
}

describe('AdminLayoutClient', () => {
  it('renders sidebar chrome around regular admin pages', () => {
    mockUsePathname.mockReturnValue('/seacook/admin/orders')

    renderLayout()

    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('mobile-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('page-content')).toBeInTheDocument()
  })

  it('renders the Branding Studio route full-bleed without sidebar chrome', () => {
    mockUsePathname.mockReturnValue('/seacook/admin/branding')

    renderLayout()

    expect(screen.queryByTestId('admin-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-sidebar')).not.toBeInTheDocument()
    expect(screen.getByTestId('page-content')).toBeInTheDocument()
  })
})
