import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { stockUnitChangeProblem } from '@/lib/inventory/recipe-line-rules'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

const captureException = jest.fn()
jest.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

// SWC leaves static imports ahead of jest.mock, so the module loads lazily.
const loadReport = () => import('@/lib/inventory/stock-failure-report')

const unit = (id: string, dimension: InventoryUnit['dimension'], abbreviation: string): InventoryUnit =>
  ({ id, name: abbreviation, abbreviation, dimension, to_base_factor: 1 }) as InventoryUnit
const UNITS = [unit('g', 'weight', 'g'), unit('ml', 'volume', 'ml'), unit('pc', 'count', 'pc')]

describe('stockUnitChangeProblem', () => {
  test('refuses a stock unit the recipe lines cannot convert to', () => {
    expect(stockUnitChangeProblem('Egg', 'pc', ['g'], UNITS)).toMatch(/Egg is used in a recipe in g/)
  })
  test('allows weight to volume (the density bridge)', () => {
    expect(stockUnitChangeProblem('Milk', 'ml', ['g'], UNITS)).toBeNull()
  })
  test('allows a change when no recipe uses it', () => {
    expect(stockUnitChangeProblem('Egg', 'pc', [], UNITS)).toBeNull()
  })
})

describe('reporting', () => {
  beforeEach(async () => {
    captureException.mockReset()
    ;(await loadReport()).resetSkippedDepletionReports()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  test('a skipped recipe line is reported once per line, not once per order', async () => {
    const { reportSkippedDepletionLine } = await loadReport()
    const line = { tenantId: 't1', inventoryItemId: 'egg', unitId: 'g' }
    reportSkippedDepletionLine({ ...line, orderId: 'o1' }, 1_000)
    reportSkippedDepletionLine({ ...line, orderId: 'o2' }, 2_000)
    reportSkippedDepletionLine({ ...line, orderId: 'o3', inventoryItemId: 'rice' }, 3_000)
    expect(captureException).toHaveBeenCalledTimes(2)
  })

  test('the same line is reported again after the quiet window', async () => {
    const { reportSkippedDepletionLine } = await loadReport()
    const line = { tenantId: 't1', orderId: 'o1', inventoryItemId: 'egg', unitId: 'g' }
    reportSkippedDepletionLine(line, 0)
    reportSkippedDepletionLine(line, 61 * 60 * 1000)
    expect(captureException).toHaveBeenCalledTimes(2)
  })

  test('a failure with no order still reaches Sentry, as an Error, without an order tag', async () => {
    const { reportStockFailure } = await loadReport()
    reportStockFailure({ tenantId: 't1', operation: 'stock_alert_write' }, { message: 'rls denied' })
    const [error, options] = captureException.mock.calls[0] as [Error, { tags: Record<string, string> }]
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('rls denied')
    expect(options.tags).not.toHaveProperty('orderId')
  })
})
