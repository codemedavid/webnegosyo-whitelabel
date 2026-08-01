/**
 * The summary that used to be a tab.
 *
 * Overview answered "is this thing working?" on a screen of its own, costing a
 * tab beside the work a merchant does many times a day. Its figures now sit as
 * one line above the ingredient list they describe, and its two logs sit below
 * it. The empty-pantry instruction leads instead of trailing four zeros.
 */

import { render, screen } from '@testing-library/react'
import { InventoryHealthStrip, InventoryLogs } from '@/components/admin/inventory-overview'
import type { InventoryHealth } from '@/lib/inventory/inventory-health'

function health(overrides: Partial<InventoryHealth> = {}): InventoryHealth {
  return {
    ingredients: { total: 24, ok: 21, low: 2, out: 1 },
    dishes: { total: 51, withRecipe: 12, autoHidden: 0 },
    gaps: [],
    ...overrides,
  }
}

describe('InventoryHealthStrip', () => {
  it('leads with the instruction when there are no ingredients', () => {
    render(
      <InventoryHealthStrip
        health={health({ ingredients: { total: 0, ok: 0, low: 0, out: 0 } })}
      />,
    )

    expect(screen.getByText(/no ingredients yet/i)).toBeInTheDocument()
    expect(screen.getByText(/flour, cheese, cooking oil/i)).toBeInTheDocument()
  })

  it('shows no figures at all on an empty pantry', () => {
    render(
      <InventoryHealthStrip
        health={health({ ingredients: { total: 0, ok: 0, low: 0, out: 0 } })}
      />,
    )

    // Four zeros would read as a working system on a quiet day.
    expect(screen.queryByText(/running low/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/out of stock/i)).not.toBeInTheDocument()
  })

  it('states the figures as one line once ingredients exist', () => {
    render(<InventoryHealthStrip health={health()} />)

    expect(screen.getByText('running low')).toBeInTheDocument()
    expect(screen.getByText('out of stock')).toBeInTheDocument()
    expect(screen.getByText(/of 51 dishes set up/i)).toBeInTheDocument()
    expect(screen.queryByText(/no ingredients yet/i)).not.toBeInTheDocument()
  })

  it('names what cannot run when a gap is reported', () => {
    render(
      <InventoryHealthStrip
        health={health({
          gaps: [
            {
              id: 'auto_86_off' as never,
              title: 'Dishes are not taken off the menu automatically',
              detail: 'Auto-86 is switched off.',
              isSelfServe: false,
            },
          ],
        })}
      />,
    )

    expect(screen.getByText(/not everything is switched on/i)).toBeInTheDocument()
    expect(screen.getByText(/needs support/i)).toBeInTheDocument()
  })
})

describe('InventoryLogs', () => {
  it('distinguishes a failed activity read from a quiet day', () => {
    render(<InventoryLogs autoHidden={[]} activity={[]} activityLoadFailed />)

    expect(screen.getByText(/could not load your recent stock activity/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing has moved yet/i)).not.toBeInTheDocument()
  })

  it('reassures when nothing is hidden for lack of stock', () => {
    render(<InventoryLogs autoHidden={[]} activity={[]} />)

    expect(screen.getByText(/nothing is hidden for lack of stock/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing has moved yet/i)).toBeInTheDocument()
  })
})

/**
 * Phase 3b — the feed shows who, not just what.
 *
 * Writing `created_by` and shaping it into the entry is worth nothing until a
 * merchant can see it. This is the same gap that left the daily report built
 * and invisible for three phases.
 */
describe('attribution in the activity feed', () => {
  const entry = (over: Record<string, unknown>) =>
    ({
      id: 'a1',
      title: 'Counted Beef',
      lines: ['-100'],
      direction: 'out',
      createdAt: '2026-07-27T10:00:00Z',
      isAutomatic: false,
      actorName: null,
      ...over,
    }) as never

  it('names the person who entered a manual movement', () => {
    render(<InventoryLogs autoHidden={[]} activity={[entry({ actorName: 'Marites' })]} />)

    expect(screen.getByText(/Marites/)).toBeInTheDocument()
  })

  it('says nothing at all when the movement names nobody', () => {
    // Every row written before this phase is unattributed. An "Unknown" label
    // on all of them would read as a system that lost the name rather than one
    // that never had it.
    render(
      <InventoryLogs
        autoHidden={[]}
        activity={[entry({ title: 'Sold', isAutomatic: true, actorName: null })]}
      />,
    )

    expect(screen.queryByText(/unknown|unattributed/i)).not.toBeInTheDocument()
  })
})
