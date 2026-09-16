export const PLATFORM_STOCK_CONTRACT_PATHS = [
  '/simple_option_stock_applications',
  '/simple_option_stock_movements',
  '/rpc/apply_simple_option_order_stock',
] as const

/** Inspect PostgREST's OpenAPI document without invoking the mutating RPC. */
export function missingPlatformStockContractPaths(document: unknown): string[] {
  const paths = document && typeof document === 'object' && 'paths' in document
    ? (document as { paths?: unknown }).paths
    : null
  const exposed = paths && typeof paths === 'object' ? paths as Record<string, unknown> : {}
  return PLATFORM_STOCK_CONTRACT_PATHS.filter((path) => !(path in exposed))
}
