/**
 * Runs `worker` over `items` with at most `limit` in flight.
 *
 * `shouldStart` is consulted before each item is picked up, so a caller with
 * a time budget can stop launching new work while letting in-flight work
 * finish. Returns how many items were started.
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStart: () => boolean = () => true
): Promise<number> {
  let next = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length && shouldStart()) {
      const index = next++
      await worker(items[index], index)
    }
  })
  await Promise.all(lanes)
  return next
}
