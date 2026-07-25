/**
 * Storefront announcement bar.
 *
 * The bar was rendered inline in the menu page at `z-[51]` — one step above the
 * z-50 layer every Radix portal (Sheet / Dialog / AlertDialog) paints on. On a
 * phone that meant the announcement strip sat *on top of* the open cart drawer,
 * covering the drawer's header row and its close control.
 *
 * These tests pin the extracted component: it renders only when the tenant
 * enabled it, it honours the tenant's colors, and — the regression that matters
 * — it stacks BELOW the overlay layer so no modal can be painted over.
 */

import { render, screen } from '@testing-library/react'
import { AnnouncementBar, OVERLAY_Z_INDEX } from '@/components/customer/announcement-bar'
import type { Tenant } from '@/types/database'

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    slug: 'acme',
    name: 'Acme',
    is_announcement_visible: true,
    announcement_text: "MC'BELS QUICK: CRUNCH. CHEER. REPEAT",
    announcement_bg_color: '#4A7C2A',
    announcement_text_color: '#FFFFFF',
    ...overrides,
  } as Tenant
}

/** Read the numeric value out of a Tailwind z-index class (`z-40`, `z-[51]`). */
function readZIndex(className: string): number {
  const match = className.match(/(?:^|\s)z-\[?(\d+)\]?(?:\s|$)/)
  expect(match).not.toBeNull()
  return Number(match![1])
}

describe('AnnouncementBar', () => {
  it('renders the tenant announcement when it is visible', () => {
    // Arrange / Act
    render(<AnnouncementBar tenant={makeTenant()} />)

    // Assert
    expect(
      screen.getByText("MC'BELS QUICK: CRUNCH. CHEER. REPEAT")
    ).toBeInTheDocument()
  })

  it('renders nothing when the tenant has the announcement hidden', () => {
    // Arrange / Act
    const { container } = render(
      <AnnouncementBar tenant={makeTenant({ is_announcement_visible: false })} />
    )

    // Assert
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no tenant', () => {
    // Arrange / Act
    const { container } = render(<AnnouncementBar tenant={null} />)

    // Assert
    expect(container).toBeEmptyDOMElement()
  })

  it('applies the tenant announcement colors', () => {
    // Arrange / Act
    render(<AnnouncementBar tenant={makeTenant()} />)

    // Assert
    const bar = screen.getByTestId('announcement-bar')
    expect(bar).toHaveStyle({ backgroundColor: '#4A7C2A', color: '#FFFFFF' })
  })

  it('stacks below the overlay layer so drawers and modals paint over it', () => {
    // Arrange / Act
    render(<AnnouncementBar tenant={makeTenant()} />)

    // Assert — this is the bug: z-[51] put the bar above every Radix portal.
    const bar = screen.getByTestId('announcement-bar')
    expect(readZIndex(bar.className)).toBeLessThan(OVERLAY_Z_INDEX)
  })
})
