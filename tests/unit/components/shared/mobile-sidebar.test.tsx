import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShoppingBag } from 'lucide-react'
import type { SidebarEntry } from '@/components/shared/sidebar-nav'

jest.mock('next/navigation', () => ({
  usePathname: () => '/seacook/admin/orders/123',
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, onClick, ...rest }: Record<string, unknown> & { children: React.ReactNode }) => (
    <a
      href={href as string}
      onClick={(event) => {
        event.preventDefault()
        ;(onClick as ((e: unknown) => void) | undefined)?.(event)
      }}
      {...Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'prefetch'))}
    >
      {children}
    </a>
  ),
}))

const items: SidebarEntry[] = [
  { label: 'Orders', href: '/seacook/admin/orders', icon: ShoppingBag },
  { label: 'Store Setup', icon: ShoppingBag, children: [{ label: 'Staff', href: '/seacook/admin/staff' }] },
]

async function renderMobileSidebar() {
  // Imported lazily: next/jest does not hoist jest.mock above static imports.
  const { MobileSidebar } = await import('@/components/shared/sidebar')
  render(<MobileSidebar items={items} basePath="/seacook" tenantName="SeaCook" />)
}

describe('MobileSidebar', () => {
  it('closes the drawer when a link to the already-lit entry is tapped', async () => {
    // Arrange: on an order's detail page, "Orders" is the lit entry.
    await renderMobileSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    const dialog = await screen.findByRole('dialog')

    // Act: following "Orders" leaves the active entry unchanged.
    fireEvent.click(screen.getByRole('link', { name: 'Orders' }))

    // Assert
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  })

  it('gives each group panel an id unique to its render site', async () => {
    // Arrange
    await renderMobileSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    const toggle = await screen.findByRole('button', { name: 'Store Setup' })

    // Act
    fireEvent.click(toggle)

    // Assert
    const panelId = toggle.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId as string)).toHaveTextContent('Staff')
  })
})
