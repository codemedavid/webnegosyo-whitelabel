import { missingPlatformStockContractPaths } from '@/lib/inventory/platform-stock-contract'

describe('platform stock deployment contract', () => {
  it('accepts the tables and RPC exposed by PostgREST', () => {
    expect(missingPlatformStockContractPaths({ paths: {
      '/simple_option_stock_applications': {},
      '/simple_option_stock_movements': {},
      '/rpc/apply_simple_option_order_stock': {},
    } })).toEqual([])
  })

  it('reports every absent path', () => {
    expect(missingPlatformStockContractPaths({ paths: {} })).toEqual([
      '/simple_option_stock_applications',
      '/simple_option_stock_movements',
      '/rpc/apply_simple_option_order_stock',
    ])
  })
})
