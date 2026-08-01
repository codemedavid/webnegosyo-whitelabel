/**
 * The way out of an accusation.
 *
 * The daily report tells a merchant, in plain language, that stock may be
 * "leaving without a sale" — and used to offer nowhere to go: the verdict
 * pointed at a list it did not link to, and the red Missing cell was not a
 * control. In a family-run shop that is an accusation about people the owner
 * knows, and a page that only ever accuses is a page they stop opening.
 *
 * These cover the round trip: the report hands off an ingredient with the
 * movement already chosen, and inventory opens on the control that answers it.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DailyReportPanel } from '@/components/admin/daily-report-panel'
import { InventoryManager } from '@/components/admin/inventory-manager'
import type { DailyReportRow } from '@/lib/inventory/daily-report'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/admin/recipe-editor', () => ({ RecipeEditor: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/app/actions/inventory', () => ({
  getStockMovementsAction: jest.fn().mockResolvedValue({ success: true, data: [] }),
  createIngredientAction: jest.fn(),
  updateIngredientAction: jest.fn(),
  deleteIngredientAction: jest.fn(),
  createInventoryUnitAction: jest.fn(),
  updateInventoryUnitAction: jest.fn(),
  deleteInventoryUnitAction: jest.fn(),
  recordStockMovementAction: jest.fn(),
}))

const GRAM: InventoryUnitRow = {
  id: 'unit-g', tenant_id: 't1', name: 'Gram', abbreviation: 'g', dimension: 'weight',
  to_base_factor: 1, is_base: true, is_active: true, created_at: '', updated_at: '',
}

const FLOUR: InventoryItem = {
  id: 'item-flour', tenant_id: 't1', name: 'Flour', sku: null, category: null,
  stock_unit_id: GRAM.id, unit_cost: 0.05, is_prep: false, image_url: null,
  current_qty: 800, reorder_level: 0, is_active: true, created_at: '', updated_at: '',
}

function line(overrides: Partial<DailyReportRow> = {}): DailyReportRow {
  return {
    inventoryItemId: 'item-flour', name: 'Flour', stockUnitAbbreviation: 'g',
    opening: 1000, received: 0, sold: 200, waste: 0, countAdjustment: 0,
    shrinkage: 0, closing: 800, cogs: 10, wasteCost: 0, shrinkageCost: 0,
    wasCounted: false, ...overrides,
  }
}

function report(overrides: Partial<DailyInventoryReportForDay> = {}): DailyInventoryReportForDay {
  return {
    dayKey: '2026-07-29', rows: [line()],
    totals: { cogs: 10, wasteCost: 0, shrinkageCost: 0 },
    countedCount: 0, uncountedCount: 1, uncostedCount: 0, ...overrides,
  }
}

describe('the report offers a way to answer a shortfall', () => {
  it('gives a short row a recount that carries the ingredient and the movement', () => {
    render(
      <DailyReportPanel
        tenantSlug="acme"
        latestDayKey="2026-07-30"
        report={report({ rows: [line({ shrinkage: 40, shrinkageCost: 2 })] })}
      />,
    )

    expect(screen.getByRole('link', { name: /count again/i })).toHaveAttribute(
      'href',
      '/acme/admin/inventory?tab=ingredients&stock=item-flour&reason=stocktake',
    )
  })

  it('offers no recount on a row that balanced', () => {
    render(
      <DailyReportPanel tenantSlug="acme" latestDayKey="2026-07-30" report={report()} />,
    )

    // Every row an action would be noise; only the accusation gets one.
    expect(screen.queryByRole('link', { name: /count again/i })).not.toBeInTheDocument()
  })

  it('points the verdict at the lines instead of describing them', () => {
    render(
      <DailyReportPanel
        tenantSlug="acme"
        latestDayKey="2026-07-30"
        dishesWithRecipe={12}
        report={report({
          rows: [line({ shrinkage: 40, shrinkageCost: 45 })],
          totals: { cogs: 120, wasteCost: 0, shrinkageCost: 45 },
          countedCount: 1,
        })}
      />,
    )

    expect(screen.getByRole('link', { name: /see what came up short/i })).toHaveAttribute(
      'href',
      '#report-lines',
    )
  })
})

describe('inventory receives the hand-off', () => {
  function renderManager(props: Record<string, unknown> = {}) {
    render(
      <InventoryManager
        tenantId="t1"
        tenantSlug="acme"
        initialIngredients={[FLOUR]}
        initialUnits={[GRAM]}
        {...props}
      />,
    )
  }

  it('opens that ingredient with the movement already set to a count', async () => {
    renderManager({ stockItemId: 'item-flour', stockReason: 'stocktake' })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/stock — flour/i)
    expect(screen.getByRole('button', { name: /^counted$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('stays closed when the URL names an ingredient that is not here', () => {
    renderManager({ stockItemId: 'item-gone', stockReason: 'stocktake' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ignores a reason the merchant could never have picked', async () => {
    // The value came off a URL, so it is untrusted input like any other.
    renderManager({ stockItemId: 'item-flour', stockReason: 'sale' })

    await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: /^received$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('lets the merchant close a deep-linked dialog', async () => {
    renderManager({ stockItemId: 'item-flour', stockReason: 'stocktake' })
    await screen.findByRole('dialog')

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    // Reopening it on every render would make it impossible to dismiss.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
