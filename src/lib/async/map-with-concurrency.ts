/** Run `worker` over `items` with a bounded number of concurrent executions. */
export async function mapWithConcurrency<I, O>(
  items: I[],
  concurrency: number,
  worker: (item: I) => Promise<O>,
): Promise<O[]> {
  const results = new Array<O>(items.length)
  let cursor = 0

  async function runner(): Promise<void> {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runner())
  await Promise.all(runners)
  return results
}
