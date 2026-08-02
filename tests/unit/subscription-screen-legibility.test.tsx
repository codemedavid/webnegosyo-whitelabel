/**
 * The collections screen, as it is actually read.
 *
 * The superadmin shell is pure black (`superadmin/layout.tsx` renders
 * `bg-background text-foreground` over a dark backdrop). This screen was
 * written against a white page, so its tenant names shipped as
 * `text-neutral-900` — near-black text on a near-black surface. The owner could
 * see the status pills and nothing else: the one column that says WHO to chase
 * was the one column that had disappeared.
 *
 * These tests are deliberately about classes rather than pixels. jsdom computes
 * no contrast, so the honest thing to assert is the palette the component asks
 * for. The forbidden list below is exactly the set of tokens that render dark
 * ink or an opaque white slab on this shell.
 */

import { render, screen, within } from '@testing-library/react'
import { buildSubscriptionRoster, summarizeRoster } from '@/lib/billing/subscription-roster'
import { SubscriptionManager } from '@/components/superadmin/subscription-manager'
import { MarkPaidDialog } from '@/components/superadmin/mark-paid-dialog'
import { AllowanceDialog } from '@/components/superadmin/allowance-dialog'
import type { AllowanceRow } from '@/lib/billing/tenant-allowances'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/actions/subscriptions', () => ({
  markTenantPaidAction: jest.fn(),
  setTenantPausedAction: jest.fn(),
  updateTenantLimitsAction: jest.fn(),
}))

const NOW = '2026-08-10T07:00:00.000Z'

const TENANT = {
  tenantId: 't-1',
  name: 'Brew Daze Express',
  slug: 'brewdazeexpress',
  paidThrough: '2026-08-30',
}

const ALLOWANCE: AllowanceRow = {
  tenantId: 't-1',
  outletLimit: 1,
  outletsUsed: 0,
  isOverOutlets: false,
  staffLimit: 3,
  peakBranchStaff: 3,
  isOverStaff: false,
}

/**
 * Tokens that vanish or shout on the black shell.
 *
 * Matched as whole class tokens, not substrings: `bg-white/[0.02]` is the
 * shell's own panel fill and must not be caught by a search for `bg-white`.
 */
const INVISIBLE_ON_BLACK = [
  'text-neutral-900',
  'text-neutral-800',
  'text-neutral-700',
  'text-neutral-600',
  'text-neutral-500',
  'text-black',
  'bg-white',
  'bg-neutral-50',
]

function offendingTokens(container: HTMLElement): string[] {
  const found = new Set<string>()
  for (const element of Array.from(container.querySelectorAll<HTMLElement>('[class]'))) {
    for (const token of element.className.split(/\s+/)) {
      if (INVISIBLE_ON_BLACK.includes(token)) found.add(token)
    }
  }
  return [...found]
}

function renderScreen() {
  const rows = buildSubscriptionRoster([TENANT], NOW)
  return render(
    <SubscriptionManager rows={rows} summary={summarizeRoster(rows)} allowances={[ALLOWANCE]} />
  )
}

describe('the collections table is readable on the black superadmin shell', () => {
  it('asks for no dark ink and no opaque white slabs anywhere on the screen', () => {
    // Arrange / Act
    const { container } = renderScreen()

    // Assert
    expect(offendingTokens(container)).toEqual([])
  })

  it('renders the tenant name in light ink, since that column is the whole point', () => {
    renderScreen()

    const name = screen.getByText('Brew Daze Express')

    expect(name.className).toMatch(/text-white/)
  })

  it('renders the tenant slug in a dimmed light ink rather than a dark grey', () => {
    renderScreen()

    const slug = screen.getByText('/brewdazeexpress')

    expect(slug.className).toMatch(/text-white\//)
  })

  it('keeps the summary tiles on the shell surface instead of white cards', () => {
    const { container } = renderScreen()

    const tile = screen.getByTestId('stat-due-soon')

    expect(tile.className).toMatch(/bg-white\/\[/)
    expect(offendingTokens(container)).toEqual([])
  })
})

describe('a row scans in one pass', () => {
  it('keeps the paid-through date on a single line', () => {
    // "2026-08-30" wrapping to "2026-08-" / "30" doubles every row's height
    // and makes a column of dates unreadable at a glance.
    renderScreen()

    const cell = screen.getByText('2026-08-30')

    expect(cell.className).toMatch(/whitespace-nowrap/)
  })

  it('keeps the primary action on a single line', () => {
    // "Mark paid" broke across two lines in the live screen.
    renderScreen()

    const action = screen.getByRole('button', { name: /mark paid/i })

    expect(action.className).toMatch(/whitespace-nowrap/)
  })

  it('labels the allowance columns so a bare "0 / 1" is not left to guess at', () => {
    renderScreen()

    const outlets = screen.getByTestId('allowance-outlets-t-1')

    expect(within(outlets).getByText(/0\s*\/\s*1/)).toBeInTheDocument()
  })
})

describe('the dialogs opened from this screen match the shell', () => {
  it('records a payment on a dark surface', () => {
    const { container } = render(
      <MarkPaidDialog
        tenantId="t-1"
        tenantName="Brew Daze Express"
        monthlyPricePhp={649}
        onClose={jest.fn()}
        onRecorded={jest.fn()}
      />
    )

    expect(offendingTokens(container)).toEqual([])
  })

  it('edits allowances on a dark surface', () => {
    const { container } = render(
      <AllowanceDialog
        tenantName="Brew Daze Express"
        allowance={ALLOWANCE}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />
    )

    expect(offendingTokens(container)).toEqual([])
  })
})
