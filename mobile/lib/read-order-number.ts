/** Optional display enrichment must never turn a saved order into a failed checkout. */
export async function readOrderNumber(
  read: () => PromiseLike<{ data: unknown; error: unknown }>,
  timeoutMs = 1000,
): Promise<number | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      Promise.resolve().then(read),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs) }),
    ])
    if (!result || result.error) return null
    const row: unknown = Array.isArray(result.data) ? result.data[0] : result.data
    if (!row || typeof row !== 'object') return null
    const number = (row as { daily_number?: unknown }).daily_number
    return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
