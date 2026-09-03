import { render, screen } from '@testing-library/react'
import { SuperAdminLayoutShell } from '@/components/superadmin/superadmin-layout-shell'

let pathname = '/superadmin/mcp/authorize'

jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

jest.mock('@/components/shared/navigation-progress', () => ({
  NavigationProgress: () => <div>Navigation progress</div>,
}))

jest.mock('@/components/superadmin/superadmin-sidebar', () => ({
  SuperAdminSidebar: () => <aside>Superadmin sidebar</aside>,
}))

jest.mock('@/components/superadmin/superadmin-topbar', () => ({
  SuperAdminTopbar: () => <header>Superadmin topbar</header>,
}))

describe('superadmin OAuth consent layout', () => {
  it('renders the consent screen without superadmin chrome', () => {
    pathname = '/superadmin/mcp/authorize'

    render(
      <SuperAdminLayoutShell>
        <div>OAuth consent</div>
      </SuperAdminLayoutShell>,
    )

    expect(screen.getByText('OAuth consent')).toBeInTheDocument()
    expect(screen.queryByText('Superadmin sidebar')).not.toBeInTheDocument()
    expect(screen.queryByText('Superadmin topbar')).not.toBeInTheDocument()
    expect(screen.queryByText('Navigation progress')).not.toBeInTheDocument()
  })

  it('keeps the ordinary superadmin chrome on normal pages', () => {
    pathname = '/superadmin/tenants'

    render(
      <SuperAdminLayoutShell>
        <div>Tenant list</div>
      </SuperAdminLayoutShell>,
    )

    expect(screen.getByText('Superadmin sidebar')).toBeInTheDocument()
    expect(screen.getByText('Superadmin topbar')).toBeInTheDocument()
    expect(screen.getByText('Navigation progress')).toBeInTheDocument()
  })
})
